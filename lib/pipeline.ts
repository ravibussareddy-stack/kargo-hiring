import "server-only";
import { db, must } from "./supabase";
import { extractCvText } from "./extract";
import { extractPii, locationFlag, piiGuard, redact } from "./pii";
import { computeTotals, sanitizeScores } from "./rubricMath";
import { getCutoff, loadValidatedCriteria } from "./rubric";
import { draftEmail, scoreRole, writeBrief, writeProbes } from "./ai";
import { ROLES, type CriterionScore, type Decision, type Pii, type Role } from "./types";

type CandidateRow = {
  id: string;
  applied_role: Role;
  status: string;
  decision: Decision | null;
  decision_overridden: boolean;
  cv_redacted: string | null;
  raw_text: string | null;
  pii: Pii;
};

async function getCandidate(id: string): Promise<CandidateRow> {
  return must(await db().from("candidates").select("*").eq("id", id).single()) as CandidateRow;
}

async function setStatus(id: string, status: string, detail: string | null = null) {
  must(await db().from("candidates").update({ status, status_detail: detail }).eq("id", id));
}

/** Throws unless the text about to go to the model is PII-free. */
function assertSafe(c: CandidateRow, texts: string[]) {
  const g = piiGuard(texts, c.pii);
  if (!g.ok) throw new PiiGuardError(g.reason);
}
class PiiGuardError extends Error {}

// ---------------- Step 1: ingest + PII separation (no AI) ----------------

export async function ingestCv(fileName: string, buf: Buffer, role: Role) {
  const { text, heading } = await extractCvText(fileName, buf);
  if (text.length < 50) throw new Error("Could not read any text from this file (scanned image PDF?).");
  const pii = extractPii(text, heading);
  const cvRedacted = redact(text, pii);
  const guard = piiGuard([cvRedacted], pii);
  const row = must(
    await db()
      .from("candidates")
      .insert({
        applied_role: role,
        file_name: fileName,
        pii,
        raw_text: text,
        location_flag: locationFlag(text),
        cv_redacted: cvRedacted,
        status: guard.ok ? "processing" : "needs_review",
        status_detail: guard.ok ? null : guard.reason,
      })
      .select("id, status, status_detail")
      .single(),
  ) as { id: string; status: string; status_detail: string | null };
  return row;
}

/** Arjun's manual fix for a needs_review candidate: correct the PII, re-redact, re-guard. */
export async function fixPii(id: string, patch: Partial<Pii>) {
  const c = await getCandidate(id);
  const pii: Pii = {
    ...c.pii,
    ...patch,
    phone: (patch.phone ?? c.pii.phone).filter(Boolean),
    urls: (patch.urls ?? c.pii.urls).filter(Boolean),
  };
  const cvRedacted = redact(c.raw_text ?? c.cv_redacted ?? "", pii);
  const g = piiGuard([cvRedacted], pii);
  must(
    await db()
      .from("candidates")
      .update({ pii, cv_redacted: cvRedacted, status: g.ok ? "processing" : "needs_review", status_detail: g.ok ? null : g.reason })
      .eq("id", id),
  );
  return g;
}

// ---------------- Steps 2 + 3: score both rubrics, write briefs ----------------

export async function processCandidate(id: string) {
  const c = await getCandidate(id);
  if (c.status === "needs_review") return { status: "needs_review" };
  if (!c.cv_redacted) throw new Error("No redacted CV.");
  try {
    assertSafe(c, [c.cv_redacted]);
    await Promise.all(ROLES.map((role) => scoreAndBrief(c, role)));
    await setStatus(id, c.status === "sent" ? "sent" : "scored");
    return { status: "scored" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof PiiGuardError) {
      await setStatus(id, "needs_review", msg);
      return { status: "needs_review", detail: msg };
    }
    await setStatus(id, "scoring_failed", msg);
    return { status: "scoring_failed", detail: msg };
  }
}

async function scoreAndBrief(c: CandidateRow, role: Role) {
  const criteria = await loadValidatedCriteria(role);
  const scores = sanitizeScores(await scoreRole(c.cv_redacted!, role, criteria));
  const totals = computeTotals(criteria, scores);

  assertSafe(c, [c.cv_redacted!, JSON.stringify(scores)]);
  const brief = await writeBrief(c.cv_redacted!, role, criteria, scores);

  must(await db().from("scores").delete().eq("candidate_id", c.id).eq("role", role));
  must(await db().from("scores").insert(scores.map((s) => ({ ...s, candidate_id: c.id, role }))));
  must(
    await db()
      .from("role_results")
      .upsert({ candidate_id: c.id, role, ...totals, brief, interview_probes: null }, { onConflict: "candidate_id,role" }),
  );
}

// ---------------- Ranking, borderline flag, probes, email drafts ----------------

type RankRow = {
  candidate_id: string;
  role: Role;
  total: number;
  pattern_soft_subtotal: number;
  interview_probes: string[] | null;
  rank: number | null;
  soft_borderline_flag: boolean;
};

function autoDecision(rank: number | null, cutoff: number): Decision {
  return rank !== null && rank <= cutoff ? "invite" : "reject";
}

/**
 * Recomputes ranks for every role, then does any pending AI work (probes for
 * the top N, drafts for changed decisions). Work is time-boxed so it fits in a
 * serverless request; returns how many items are still pending — call again.
 */
export async function recompute(budgetMs = 40_000): Promise<{ pending: number; errors: string[] }> {
  const started = Date.now();
  const cutoff = await getCutoff();
  const candidates = must(
    await db().from("candidates").select("id, applied_role, status, decision, decision_overridden, cv_redacted, pii").in("status", ["scored", "sent"]),
  ) as CandidateRow[];
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const results = must(await db().from("role_results").select("candidate_id, role, total, pattern_soft_subtotal, interview_probes, rank, soft_borderline_flag")) as RankRow[];

  const jobs: (() => Promise<void>)[] = [];

  for (const role of ROLES) {
    const applicants = results
      .filter((r) => r.role === role && byId.get(r.candidate_id)?.applied_role === role)
      .map((r) => ({ ...r, total: Number(r.total), pattern_soft_subtotal: Number(r.pattern_soft_subtotal) }));
    const ranked = [...applicants].sort((a, b) => b.total - a.total);
    // Borderline: invited now, but not if B3 (soft) were removed from everyone.
    const withoutSoft = [...applicants].sort((a, b) => b.total - b.pattern_soft_subtotal - (a.total - a.pattern_soft_subtotal));
    const topWithoutSoft = new Set(withoutSoft.slice(0, cutoff).map((r) => r.candidate_id));

    for (const [i, r] of ranked.entries()) {
      const rank = i + 1;
      const borderline = rank <= cutoff && !topWithoutSoft.has(r.candidate_id);
      if (r.rank !== rank || r.soft_borderline_flag !== borderline) {
        must(await db().from("role_results").update({ rank, soft_borderline_flag: borderline }).eq("candidate_id", r.candidate_id).eq("role", role));
      }
      const c = byId.get(r.candidate_id)!;
      if (rank <= cutoff && !r.interview_probes) jobs.push(() => generateProbes(c, role));
    }
    // Non-applicants carry no rank for this role.
    const nonApplicantIds = results.filter((r) => r.role === role && byId.get(r.candidate_id)?.applied_role !== role && r.rank !== null).map((r) => r.candidate_id);
    if (nonApplicantIds.length) must(await db().from("role_results").update({ rank: null, soft_borderline_flag: false }).eq("role", role).in("candidate_id", nonApplicantIds));

    // Decisions + drafts for the applied role.
    const emails = must(await db().from("emails").select("candidate_id, type")) as { candidate_id: string; type: Decision }[];
    const emailType = new Map(emails.map((e) => [e.candidate_id, e.type]));
    for (const [i, r] of ranked.entries()) {
      const c = byId.get(r.candidate_id)!;
      if (c.status === "sent") continue;
      const want = c.decision_overridden && c.decision ? c.decision : autoDecision(i + 1, cutoff);
      if (c.decision !== want) {
        must(await db().from("candidates").update({ decision: want }).eq("id", c.id));
        c.decision = want;
      }
      if (emailType.get(c.id) !== want) jobs.push(() => generateDraft(c, want));
    }
  }

  const errors: string[] = [];
  let done = 0;
  // Run with small concurrency until the time budget runs out.
  const queue = [...jobs];
  const worker = async () => {
    while (queue.length && Date.now() - started < budgetMs) {
      const job = queue.shift()!;
      try {
        await job();
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
      done++;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { pending: jobs.length - done, errors };
}

async function generateProbes(c: CandidateRow, role: Role) {
  const criteria = await loadValidatedCriteria(role);
  const scores = must(await db().from("scores").select("criterion_key, score, evidence, reason").eq("candidate_id", c.id).eq("role", role)) as CriterionScore[];
  assertSafe(c, [c.cv_redacted!, JSON.stringify(scores)]);
  const probes = await writeProbes(c.cv_redacted!, role, criteria, scores);
  must(await db().from("role_results").update({ interview_probes: probes }).eq("candidate_id", c.id).eq("role", role));
}

async function generateDraft(c: CandidateRow, type: Decision) {
  assertSafe(c, [c.cv_redacted!]);
  const { subject, body } = await draftEmail(c.cv_redacted!, c.applied_role, type);
  must(
    await db()
      .from("emails")
      .upsert(
        { candidate_id: c.id, type, subject, body_template: body, edited_body: null, status: "draft", last_error: null, updated_at: new Date().toISOString() },
        { onConflict: "candidate_id" },
      ),
  );
}

/** Arjun flips invite <-> reject. Marks it overridden (unless it matches the auto decision) and redrafts. */
export async function setDecision(id: string, decision: Decision) {
  const c = await getCandidate(id);
  if (c.status === "sent") throw new Error("Email already sent.");
  const rr = must(await db().from("role_results").select("rank").eq("candidate_id", id).eq("role", c.applied_role).single()) as { rank: number | null };
  const overridden = decision !== autoDecision(rr.rank, await getCutoff());
  must(await db().from("candidates").update({ decision, decision_overridden: overridden }).eq("id", id));
  await generateDraft({ ...c, decision }, decision);
}
