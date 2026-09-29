import "server-only";
import { db, selectAll } from "./supabase";
import { getSettings, loadCriteria, type Settings } from "./rubric";
import { deliveryTarget, emailConfigured, finalEmail, testMode } from "./send";
import { hasOriginals } from "./storage";
import type { Criterion, Decision, LocationFlag, Pii, Role } from "./types";

export type RoleResult = {
  role: Role;
  total: number;
  requirements_subtotal: number;
  pattern_hard_subtotal: number;
  pattern_soft_subtotal: number;
  trust_subtotal: number;
  soft_borderline_flag: boolean;
  brief: string | null;
  interview_probes: string[] | null;
  rank: number | null;
  scores: { criterion_key: string; score: number; evidence: string; reason: string }[];
};

export type CandidateView = {
  id: string;
  created_at: string;
  applied_role: Role;
  file_name: string;
  name: string | null;
  email: string | null;
  phone: string[];
  location_flag: LocationFlag;
  status: string;
  status_detail: string | null;
  decision: Decision | null;
  decision_overridden: boolean;
  sent_at: string | null;
  results: Partial<Record<Role, RoleResult>>;
  /** Where Send will actually deliver (test inbox in TEST_MODE), or why it's blocked. */
  delivery: { to: string | null; blocked: string | null };
  notes: { id: string; author: string; body: string; created_at: string }[];
  email_note: string | null;
  ai_signal: { likelihood: number; level: "low" | "medium" | "high"; signals: string[]; summary: string } | null;
  interview_stage: "invited" | "wip" | "offered" | "dropped";
  interview_stage_at: string | null;
  drop_reason: string | null;
  /** original file extension if the uploaded file is stored ("pdf" | "docx" | "txt"), else null */
  original_ext: string | null;
  email_draft: { type: Decision; subject: string; body: string; status: string; last_error: string | null } | null;
};

export type DashboardData = {
  candidates: CandidateView[];
  criteria: Criterion[];
  cutoff: number;
  settings: Settings;
  emailConfigured: boolean;
  testMode: boolean;
  /** false until migration 003 has been run */
  notesReady: boolean;
  /** false until migration 005 has been run */
  stagesReady: boolean;
};

export async function loadDashboard(): Promise<DashboardData> {
  const [criteria, settings] = await Promise.all([loadCriteria(), getSettings()]);
  const cutoff = settings.invite_cutoff;
  // select("*") so columns added by later migrations appear when present and are simply absent before.
  // raw_text / cv_redacted are read server-side only and never passed to the page.
  const [cands, results, scores, emails, notesRes] = await Promise.all([
    selectAll<any>((a, b) => db().from("candidates").select("*").order("created_at", { ascending: false }).order("id").range(a, b)),
    selectAll<any>((a, b) => db().from("role_results").select("*").order("candidate_id").order("role").range(a, b)),
    selectAll<any>((a, b) => db().from("scores").select("candidate_id, role, criterion_key, score, evidence, reason").order("id").range(a, b)),
    selectAll<any>((a, b) => db().from("emails").select("*").order("id").range(a, b)),
    selectAll<any>((a, b) => db().from("candidate_notes").select("id, candidate_id, author, body, created_at").order("created_at").order("id").range(a, b))
      .then((rows) => ({ ok: true as const, rows }))
      .catch(() => ({ ok: false as const, rows: [] as any[] })),
  ]);

  const stored = await hasOriginals(cands.map((c) => c.id)).catch(() => new Set<string>());
  const candidates: CandidateView[] = cands.map((c) => {
    const pii = c.pii as Pii;
    const res: CandidateView["results"] = {};
    for (const r of results.filter((r) => r.candidate_id === c.id)) {
      res[r.role as Role] = {
        ...r,
        total: Number(r.total),
        requirements_subtotal: Number(r.requirements_subtotal),
        pattern_hard_subtotal: Number(r.pattern_hard_subtotal),
        pattern_soft_subtotal: Number(r.pattern_soft_subtotal),
        trust_subtotal: Number(r.trust_subtotal),
        scores: scores.filter((s) => s.candidate_id === c.id && s.role === r.role),
      };
    }
    const e = emails.find((e) => e.candidate_id === c.id);
    return {
      id: c.id,
      created_at: c.created_at,
      applied_role: c.applied_role,
      file_name: c.file_name,
      name: pii.name,
      email: pii.email,
      phone: pii.phone ?? [],
      location_flag: c.location_flag,
      status: c.status,
      status_detail: c.status_detail,
      decision: c.decision,
      decision_overridden: c.decision_overridden,
      sent_at: c.sent_at,
      results: res,
      delivery: deliveryTarget(pii.email),
      notes: notesRes.rows.filter((n) => n.candidate_id === c.id).map(({ id, author, body, created_at }) => ({ id, author, body, created_at })),
      email_note: c.email_note ?? null,
      ai_signal: c.ai_signal ?? null,
      interview_stage: c.interview_stage ?? "invited",
      interview_stage_at: c.interview_stage_at ?? null,
      drop_reason: c.drop_reason ?? null,
      original_ext: stored.has(c.id) ? (String(c.file_name).toLowerCase().split(".").pop() ?? null) : null,
      email_draft: e ? { type: e.type, ...finalEmail(e, pii), status: e.status, last_error: e.last_error } : null,
    };
  });
  return { candidates, criteria, cutoff, settings, emailConfigured: emailConfigured(), testMode: testMode(), notesReady: notesRes.ok, stagesReady: cands.length === 0 || "interview_stage" in cands[0] };
}
