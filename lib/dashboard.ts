import "server-only";
import { db, must } from "./supabase";
import { getSettings, loadCriteria, type Settings } from "./rubric";
import { deliveryTarget, emailConfigured, finalEmail, testMode } from "./send";
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
  email_draft: { type: Decision; subject: string; body: string; status: string; last_error: string | null } | null;
};

export type DashboardData = {
  candidates: CandidateView[];
  criteria: Criterion[];
  cutoff: number;
  settings: Settings;
  emailConfigured: boolean;
  testMode: boolean;
};

export async function loadDashboard(): Promise<DashboardData> {
  const [criteria, settings] = await Promise.all([loadCriteria(), getSettings()]);
  const cutoff = settings.invite_cutoff;
  const [cands, results, scores, emails] = await Promise.all([
    db().from("candidates").select("id, created_at, applied_role, file_name, pii, location_flag, status, status_detail, decision, decision_overridden, sent_at").order("created_at", { ascending: false }),
    db().from("role_results").select("*"),
    db().from("scores").select("candidate_id, role, criterion_key, score, evidence, reason"),
    db().from("emails").select("*"),
  ]).then((rs) => rs.map((r) => must(r) as any[]));

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
      email_draft: e ? { type: e.type, ...finalEmail(e, pii), status: e.status, last_error: e.last_error } : null,
    };
  });
  return { candidates, criteria, cutoff, settings, emailConfigured: emailConfigured(), testMode: testMode() };
}
