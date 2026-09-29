"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateView, DashboardData, RoleResult } from "@/lib/dashboard";
import type { Criterion, Role } from "@/lib/types";
import { api, runRecompute, runRecomputeDetailed } from "./api";

const OTHER: Record<Role, Role> = { PM: "SPM", SPM: "PM" };
const ROLE_NAME: Record<Role, string> = { PM: "Product Manager", SPM: "Senior Product Manager" };
const LOC: Record<string, string> = {
  mumbai: "Mumbai",
  relocating: "Relocating to Mumbai",
  other: "Outside Mumbai",
  unknown: "Location unknown",
};

type Field = "requirements_subtotal" | "pattern_hard_subtotal" | "pattern_soft_subtotal" | "trust_subtotal";
const BUCKETS: { key: Criterion["bucket"]; label: string; hint: string; color: string; field: Field }[] = [
  { key: "requirements", label: "Role requirements", hint: "From the job description", color: "var(--b-req)", field: "requirements_subtotal" },
  { key: "pattern_hard", label: "Track record", hint: "What Arjun's best hires had done", color: "var(--b-hard)", field: "pattern_hard_subtotal" },
  { key: "pattern_soft", label: "How they write", hint: "Problem-first, first-hand language. Judge the quotes yourself", color: "var(--b-soft)", field: "pattern_soft_subtotal" },
  { key: "trust", label: "Trust & ownership", hint: "Owns outcomes, including failures", color: "var(--b-trust)", field: "trust_subtotal" },
];
const bucketMax = (criteria: Criterion[], bucket: Criterion["bucket"]) => criteria.filter((c) => c.bucket === bucket).reduce((s, c) => s + c.weight, 0);

export type RunFn = (label: string, fn: () => Promise<unknown>) => Promise<void>;

export default function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Role>("PM");
  const [everyone, setEveryone] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    setFlash(null);
    try {
      const result = await fn();
      if (typeof result === "string") setFlash(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  const attention = data.candidates.filter((c) => ["needs_review", "scoring_failed", "processing"].includes(c.status));
  const list = useMemo(
    () =>
      data.candidates
        .filter((c) => c.results[tab] && (everyone || c.applied_role === tab))
        .sort((a, b) => b.results[tab]!.total - a.results[tab]!.total),
    [data.candidates, tab, everyone],
  );
  const criteria = data.criteria.filter((c) => c.role === tab);
  const lastInviteIdx = list.reduce((acc, c, i) => (c.applied_role === tab && c.decision === "invite" ? i : acc), -1);
  const current = list.find((c) => c.id === selected) ?? null;

  // Keyboard: Esc closes, ↑/↓ moves through the list while the panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "Escape") setSelected(null);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = list.findIndex((c) => c.id === selected);
        const next = list[i + (e.key === "ArrowDown" ? 1 : -1)];
        if (next) setSelected(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, list]);

  return (
    <>
      <header className="page-head">
        <Greeting candidates={data.candidates} />
        <InviteRule data={data} run={run} busy={!!busy} />
      </header>

      <Overview candidates={data.candidates} testMode={data.testMode} />

      {busy && <div className="toast"><span className="spinner" />{busy}</div>}
      {!busy && flash && <div className="toast done" onClick={() => setFlash(null)}>✓ {flash}</div>}
      {err && <div className="error">{err}</div>}
      {attention.length > 0 && <Attention items={attention} run={run} busy={!!busy} />}

      <div className="tabs-row">
        <div className="utabs" role="tablist">
          {(["PM", "SPM"] as Role[]).map((r) => (
            <button key={r} role="tab" aria-selected={tab === r} className={tab === r ? "on" : ""} onClick={() => { setTab(r); setSelected(null); }}>
              <span className="long">{ROLE_NAME[r]}</span><span className="short">{r === "PM" ? "PM" : "Senior PM"}</span> <span className="count">{data.candidates.filter((c) => c.applied_role === r).length}</span>
            </button>
          ))}
        </div>
        <label className="switch">
          <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
          <span className="track" /> Include {OTHER[tab]} applicants
        </label>
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <p>No scored candidates yet.</p>
          <a className="btn primary" href="/upload">Upload CVs</a>
        </div>
      ) : (
        <div className="table" role="list">
          <div className="legend-band" aria-label="Score breakdown key">
            <span className="muted">Score breakdown</span>
            {BUCKETS.map((b) => {
              const max = bucketMax(criteria, b.key);
              return <span key={b.key} title={b.hint}><i style={{ background: b.color }} />{b.label} <span className="faint">/{max}</span></span>;
            })}
          </div>
          <div className="thead">
            <span>#</span><span>Candidate</span><span className="hide-sm">Breakdown</span><span className="num">Score</span><span className="hide-sm">Decision</span>
          </div>
          {list.map((c, i) => (
            <div key={c.id}>
              <Row c={c} role={tab} criteria={criteria} active={c.id === selected} onOpen={() => setSelected(c.id)} position={i + 1} run={run} busy={!!busy} />
              {!everyone && i === lastInviteIdx && i < list.length - 1 && (
                <div className="cutline"><span>Invite line · top {data.cutoff} scoring {data.settings.min_invite_score}+</span></div>
              )}
            </div>
          ))}
        </div>
      )}


      {current && (
        <Drawer key={current.id} c={current} role={tab} criteria={criteria} data={data} run={run} busy={!!busy} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

/** Personal greeting + one line on what needs doing next. Time of day is read client-side to avoid a hydration mismatch. */
function Greeting({ candidates }: { candidates: CandidateView[] }) {
  const [hello, setHello] = useState("Welcome");
  useEffect(() => {
    const h = new Date().getHours();
    setHello(h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);
  const scored = candidates.filter((c) => c.status === "scored" || c.status === "sent");
  const invitesPending = scored.filter((c) => c.decision === "invite" && c.status !== "sent").length;
  const rejectsPending = scored.filter((c) => c.decision === "reject" && c.status !== "sent").length;
  const sent = candidates.filter((c) => c.status === "sent").length;
  const needs = candidates.filter((c) => c.status === "needs_review" || c.status === "scoring_failed").length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  let line: string;
  if (!candidates.length) line = "No CVs yet. Upload some to get a ranked shortlist.";
  else if (needs) line = `${plural(needs, "CV")} need${needs === 1 ? "s" : ""} your attention before ${needs === 1 ? "it" : "they"} can be scored.`;
  else if (invitesPending) line = `${plural(invitesPending, "invite")} ready to review${sent ? `, ${sent} sent so far` : ". Nothing has been sent yet"}.`;
  else if (rejectsPending) line = `All invites are out. ${plural(rejectsPending, "rejection")} still to send.`;
  else line = "Every candidate has heard back. Nice work.";
  return (
    <div>
      <div className="welcome">Welcome</div>
      <h1>{hello}, Arjun</h1>
      <p className="muted">{line}</p>
    </div>
  );
}

/** What the rule would do, computed in the browser before saving. Overrides and sent emails are kept as they are. */
function previewInvites(candidates: CandidateView[], cutoff: number, min: number) {
  let total = 0;
  const perRole: Record<Role, number> = { PM: 0, SPM: 0 };
  for (const role of ["PM", "SPM"] as Role[]) {
    const ranked = candidates
      .filter((c) => c.applied_role === role && c.results[role] && (c.status === "scored" || c.status === "sent"))
      .sort((a, b) => b.results[role]!.total - a.results[role]!.total);
    ranked.forEach((c, i) => {
      const auto = i + 1 <= cutoff && c.results[role]!.total >= min ? "invite" : "reject";
      const d = c.status === "sent" || c.decision_overridden ? c.decision : auto;
      if (d === "invite") { total++; perRole[role]++; }
    });
  }
  return { total, perRole };
}

function InviteRule({ data, run, busy }: { data: DashboardData; run: RunFn; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [cutoff, setCutoff] = useState(String(data.cutoff));
  const [minScore, setMinScore] = useState(String(data.settings.min_invite_score));
  const changed = cutoff !== String(data.cutoff) || minScore !== String(data.settings.min_invite_score);
  const valid = Number.isInteger(Number(cutoff)) && Number(cutoff) >= 0 && Number(minScore) >= 0 && Number(minScore) <= 100 && cutoff !== "" && minScore !== "";
  const now = data.candidates.filter((c) => (c.status === "scored" || c.status === "sent") && c.decision === "invite").length;
  const next = valid ? previewInvites(data.candidates, Number(cutoff), Number(minScore)) : null;
  const diff = next ? next.total - now : 0;
  return (
    <div style={{ position: "relative" }}>
      <button className="btn" onClick={() => { setCutoff(String(data.cutoff)); setMinScore(String(data.settings.min_invite_score)); setOpen(!open); }}>
        Invite rule <span className="muted">· top {data.cutoff}, score {data.settings.min_invite_score}+</span>
      </button>
      {open && (
        <div className="popover">
          <label>Invite the top <input type="number" min={0} value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></label>
          <label>Minimum score <input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} /></label>
          {!data.settings.min_score_migrated && <p className="small muted">Minimum is fixed at 50 until the SQL update is run.</p>}
          {next && (
            <div className="preview">
              <div><b>{next.total}</b> invites <span className="muted">· PM {next.perRole.PM} · SPM {next.perRole.SPM}</span></div>
              <div className={`small ${diff ? "" : "muted"}`}>{!changed ? "Current rule" : diff === 0 ? "Same number of invites as now" : `${diff > 0 ? "+" : ""}${diff} vs now (${now})`}</div>
            </div>
          )}
          <p className="small muted">Emails that change are rewritten. Your manual Invite/Reject choices and sent emails are kept.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="btn primary"
              disabled={busy || !changed || !valid}
              onClick={() => { setOpen(false); run("Applying the invite rule and rewriting emails…", async () => {
                await api("/api/settings", "PUT", { invite_cutoff: Number(cutoff), min_invite_score: Number(minScore) });
                const { errors, changed } = await runRecomputeDetailed();
                if (errors.length) throw new Error(errors.join("\n"));
                return `Invite rule applied: ${next?.total ?? "?"} invites · ${changed} decision${changed === 1 ? "" : "s"} changed`;
              }); }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pipeline totals across both roles, regardless of tab. */
function Overview({ candidates, testMode }: { candidates: CandidateView[]; testMode: boolean }) {
  const by = (role: Role, f: (c: CandidateView) => boolean) => candidates.filter((c) => c.applied_role === role && f(c)).length;
  const split = (f: (c: CandidateView) => boolean) => `PM ${by("PM", f)} · SPM ${by("SPM", f)}`;
  const scored = (c: CandidateView) => c.status === "scored" || c.status === "sent";
  const invite = (c: CandidateView) => scored(c) && c.decision === "invite";
  const reject = (c: CandidateView) => scored(c) && c.decision === "reject";
  const sent = candidates.filter((c) => c.status === "sent").length;
  const failed = candidates.filter((c) => c.status !== "sent" && c.email_draft?.status === "failed").length;
  const needs = candidates.filter((c) => c.status === "needs_review" || c.status === "scoring_failed").length;
  const nScored = candidates.filter(scored).length;
  const mumbai = (c: CandidateView) => c.location_flag === "mumbai" || c.location_flag === "relocating";
  const stats = [
    { label: "CVs received", value: candidates.length, sub: split(() => true) },
    { label: "Scored", value: nScored, sub: needs ? `${needs} need attention` : "All processed", warn: needs > 0 },
    { label: "To invite", value: candidates.filter(invite).length, sub: split(invite) },
    { label: "To reject", value: candidates.filter(reject).length, sub: split(reject) },
    { label: "Emails sent", value: sent, of: nScored, sub: failed ? `${failed} failed` : testMode ? "Test mode" : "Live", warn: failed > 0 },
    { label: "Mumbai or relocating", value: candidates.filter(mumbai).length, sub: split(mumbai) },
  ];
  return (
    <section className="stats" aria-label="Overview">
      {stats.map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat-label">{s.label}</div>
          <div className="stat-value">{s.value}{s.of !== undefined && <small> / {s.of}</small>}</div>
          <div className={`stat-sub ${s.warn ? "warn" : ""}`}>{s.warn && "⚠ "}{s.sub}</div>
        </div>
      ))}
    </section>
  );
}

function ScoreStack({ r, criteria }: { r: RoleResult; criteria: Criterion[] }) {
  return (
    <div className="stack" title={BUCKETS.map((b) => `${b.label}: ${r[b.field]} / ${bucketMax(criteria, b.key)}`).join("\n")}>
      {BUCKETS.map((b) => <span key={b.key} style={{ width: `${r[b.field]}%`, background: b.color }} />)}
    </div>
  );
}

/** Invite | Reject for any candidate, whatever the score. Switching redrafts their email. Sent = locked. */
function DecisionToggle({ c, run, busy, compact }: { c: CandidateView; run: RunFn; busy: boolean; compact?: boolean }) {
  if (c.status === "sent") return <span className="pill good" title={c.sent_at ? `Sent ${new Date(c.sent_at).toLocaleString()}` : "Sent"}>✓ Sent · {c.decision === "invite" ? "Invite" : "Reject"}</span>;
  if (c.email_draft?.status === "failed") return <span className="pill bad">Send failed</span>;
  if (!c.decision) return <span className="pill ghost">—</span>;
  const set = (d: "invite" | "reject") => {
    if (d === c.decision) return;
    const who = c.name ?? "this candidate";
    if (!confirm(`${d === "invite" ? "Invite" : "Reject"} ${who}? Their email draft will be rewritten${c.email_draft ? " (manual edits are replaced)" : ""}.`)) return;
    run(`${d === "invite" ? "Inviting" : "Rejecting"} ${who} and redrafting…`, () => api(`/api/candidates/${c.id}/decision`, "POST", { decision: d }));
  };
  return (
    <span className={`decide ${compact ? "compact" : ""}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
      title={c.decision_overridden ? "Your call: differs from the rubric's recommendation" : "Rubric's recommendation"}>
      {(["invite", "reject"] as const).map((d) => (
        <button key={d} type="button" disabled={busy} aria-pressed={c.decision === d} className={c.decision === d ? `on ${d}` : ""} onClick={() => set(d)}>
          {d === "invite" ? "Invite" : "Reject"}
        </button>
      ))}
      {c.decision_overridden && <span className="override-dot" aria-label="Your call" />}
    </span>
  );
}

function Row({ c, role, criteria, active, onOpen, position, run, busy }: {
  c: CandidateView; role: Role; criteria: Criterion[]; active: boolean; onOpen: () => void; position: number; run: RunFn; busy: boolean;
}) {
  const r = c.results[role]!;
  const other = c.results[OTHER[role]];
  const applied = c.applied_role === role;
  return (
    <div className={`tr ${active ? "active" : ""}`} onClick={onOpen} role="listitem" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <span className={`rank ${applied && c.decision === "invite" ? "top" : ""}`}>{applied ? r.rank ?? position : "–"}</span>
      <span className="who">
        <span className="name">{c.name ?? "(no name)"}</span>
        <span className="meta">
          {LOC[c.location_flag] ?? LOC.unknown}
          {!applied && <span className="flag muted-flag">Applied {c.applied_role}</span>}
          {other && other.total > r.total && <span className="flag">Stronger fit for {OTHER[role]}</span>}
          {r.soft_borderline_flag && <span className="flag">Borderline</span>}
          {applied && c.decision === "invite" && c.interview_stage === "wip" && <span className="flag stage-wip">Interviewing</span>}
          {applied && c.decision === "invite" && c.interview_stage === "offered" && <span className="flag stage-offered">✓ Offered</span>}
          {applied && c.decision === "invite" && c.interview_stage === "dropped" && <span className="flag stage-dropped">Dropped off</span>}
          {c.notes.length > 0 && <span className="note-count" title={`${c.notes.length} team note${c.notes.length === 1 ? "" : "s"}`}>✎ {c.notes.length}</span>}
        </span>
      </span>
      <span className="hide-sm"><ScoreStack r={r} criteria={criteria} /></span>
      <span className="score num">{Math.round(r.total)}</span>
      <span className="decision-cell"><DecisionToggle c={c} run={run} busy={busy} compact /></span>
    </div>
  );
}

function Dots({ n }: { n: number }) {
  return (
    <span className="dots" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? "on" : ""} />)}
    </span>
  );
}

const AUTHOR_KEY = "kargo-note-author";
export function useAuthor(): [string, (v: string) => void] {
  const [author, setAuthor] = useState("Arjun");
  useEffect(() => {
    try { const v = localStorage.getItem(AUTHOR_KEY); if (v) setAuthor(v); } catch {}
  }, []);
  return [author, (v: string) => { setAuthor(v); try { localStorage.setItem(AUTHOR_KEY, v); } catch {} }];
}

function MigrationHint() {
  return <p className="notice small">Notes need one database update: run <code>supabase/migrations/003_notes.sql</code> in the Supabase SQL editor.</p>;
}

/** Internal notes for Arjun and the team. Never sent to the candidate or to the AI. */
function TeamNotes({ c, data, run, busy }: { c: CandidateView; data: DashboardData; run: RunFn; busy: boolean }) {
  const [author, setAuthor] = useAuthor();
  const [body, setBody] = useState("");
  if (!data.notesReady) return <MigrationHint />;
  const add = () => run("Saving note…", async () => {
    await api(`/api/candidates/${c.id}/notes`, "POST", { author, body });
    setBody("");
  });
  return (
    <div>
      <p className="muted small" style={{ marginTop: 0 }}>Visible to everyone who can log in. Never sent to the candidate.</p>
      {c.notes.length === 0 ? <p className="empty-note">No notes yet.</p> : (
        <ul className="notes">
          {c.notes.map((n) => (
            <li key={n.id}>
              <div className="note-meta">
                <span className="avatar">{n.author.slice(0, 1).toUpperCase()}</span>
                <b>{n.author}</b>
                <span className="muted">{new Date(n.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                <span className="spacer" />
                <button className="icon-btn small" title="Delete note" disabled={busy} onClick={() => confirm("Delete this note?") && run("Deleting note…", () => api(`/api/notes/${n.id}`, "DELETE"))}>✕</button>
              </div>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="note-form">
        <textarea rows={3} placeholder="Add a note for the team: impressions, follow-ups, reference checks…" value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) add(); }} />
        <div className="row">
          <label className="small muted row" style={{ gap: 6 }}>As <input style={{ width: 130, padding: "5px 8px" }} value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
          <span className="spacer" />
          <span className="small muted hide-sm">⌘↵</span>
          <button className="btn primary" disabled={busy || !body.trim() || !author.trim()} onClick={add}>Add note</button>
        </div>
      </div>
    </div>
  );
}

/** Arjun's own line for the email. The draft is rewritten around it, and it survives future redrafts. */
function PersonalNote({ c, data, run, busy }: { c: CandidateView; data: DashboardData; run: RunFn; busy: boolean }) {
  const [open, setOpen] = useState(Boolean(c.email_note));
  const [note, setNote] = useState(c.email_note ?? "");
  if (!data.notesReady) return null;
  const saved = c.email_note ?? "";
  const changed = note.trim() !== saved.trim();
  const apply = (value: string | null, label: string) => {
    if (c.email_draft && !confirm("This rewrites the draft around your note. Any manual edits to the draft will be replaced. Continue?")) return;
    run(label, () => api(`/api/candidates/${c.id}/email-note`, "PUT", { note: value }));
  };
  if (!open) {
    return <button className="btn ghost add-note" onClick={() => setOpen(true)}>+ Add a personal note to this email</button>;
  }
  return (
    <div className="personal-note">
      <div className="row" style={{ marginBottom: 6 }}>
        <b className="small">Your personal note</b>
        <span className="muted small">· woven into the email in your words</span>
      </div>
      <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder={c.decision === "reject"
          ? "e.g. Your freight-desk tracker stood out. If a role with more ops focus opens, I'd like to reach out."
          : "e.g. Your BoL rebuild is exactly the problem we're solving. Keen to hear how you ran discovery."} />
      <div className="row" style={{ marginTop: 8 }}>
        {saved && <button className="btn ghost small danger" disabled={busy} onClick={() => { setNote(""); apply(null, "Removing your note and redrafting…"); }}>Remove note</button>}
        <span className="spacer" />
        {!saved && <button className="btn ghost small" onClick={() => { setOpen(false); setNote(""); }}>Cancel</button>}
        <button className="btn primary small" disabled={busy || !note.trim() || !changed} onClick={() => apply(note, "Adding your note and redrafting…")}>
          {saved ? "Update & redraft" : "Add to email"}
        </button>
      </div>
      {saved && !changed && <p className="small muted" style={{ margin: "6px 0 0" }}>✓ Included in the draft below. Kept if the draft is rewritten.</p>}
    </div>
  );
}

/** Move the application between PM and SPM. Scores for both already exist; only ranking + email change. */
function RoleSwitch({ c, run, busy }: { c: CandidateView; run: RunFn; busy: boolean }) {
  const locked = c.status === "sent";
  const move = (role: Role) => {
    if (role === c.applied_role || locked) return;
    const pm = c.results.PM?.total, spm = c.results.SPM?.total;
    if (!confirm(`Move ${c.name ?? "this candidate"} to the ${ROLE_NAME[role]} role?\n\nThey'll be ranked on the ${role} rubric (${Math.round((role === "PM" ? pm : spm) ?? 0)}/100) and get a new email draft for that role. Any Invite/Reject choice or draft edits for the current role are reset.`)) return;
    run(`Moving to ${role} and redrafting…`, async () => {
      await api(`/api/candidates/${c.id}/role`, "POST", { role });
      const errs = await runRecompute();
      if (errs.length) throw new Error(errs.join("\n"));
      return `Moved to ${ROLE_NAME[role]}. New draft written.`;
    });
  };
  return (
    <div className="role-switch" title={locked ? "Email already sent: role can't change" : "Change which role this application is for"}>
      <span className="muted small">Applied for</span>
      <span className="seg">
        {(["PM", "SPM"] as Role[]).map((r) => (
          <button key={r} type="button" disabled={busy || locked} className={c.applied_role === r ? "on" : ""} onClick={() => move(r)}>
            {r} <span className="faint">{Math.round(c.results[r]?.total ?? 0)}</span>
          </button>
        ))}
      </span>
    </div>
  );
}

/** Information-only: an estimate of AI-generated CV text. Deliberately separated from the score. */
function AiSignalCard({ s }: { s: CandidateView["ai_signal"] }) {
  if (!s) return null;
  const label = { low: "Low", medium: "Medium", high: "High" }[s.level];
  return (
    <div className={`ai-signal ${s.level}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>AI-writing signal</h3>
        <span className="ai-level">{label} · ~{s.likelihood}%</span>
      </div>
      <div className="meter" style={{ margin: "10px 0 8px" }}><span style={{ width: `${s.likelihood}%` }} /></div>
      <p className="small" style={{ margin: "0 0 8px" }}>{s.summary}</p>
      {s.signals.length > 0 && <div className="ai-quotes">{s.signals.map((q, i) => <span key={i}>“{q}”</span>)}</div>}
      <p className="small muted" style={{ margin: "8px 0 0" }}>Estimate only. AI detection is unreliable. Not used in scoring or decisions, and never judged on grammar or English fluency.</p>
    </div>
  );
}

type DrawerTab = "summary" | "evidence" | "interview" | "notes" | "email";

export function Drawer({ c, role, criteria, data, run, busy, onClose }: {
  c: CandidateView; role: Role; criteria: Criterion[]; data: DashboardData; run: RunFn; busy: boolean; onClose: () => void;
}) {
  const [view, setView] = useState<DrawerTab>("summary");
  const r = c.results[role]!;
  const other = c.results[OTHER[role]];
  const applied = c.applied_role === role;
  const byKey = new Map(r.scores.map((s) => [s.criterion_key, s]));
  const nameOf = new Map(criteria.map((k) => [k.key, k.name]));
  // Older briefs cite rubric codes ("Under A4 Discovery…"); show plain names only.
  const lines = (r.brief ?? "").split("\n").map((l) => l.trim().replace(/\b[ABC][1-5]\b\s*/g, "")).filter(Boolean);
  const pros = lines.filter((l) => l.startsWith("+")).map((l) => l.replace(/^\+\s*/, ""));
  const cons = lines.filter((l) => !l.startsWith("+")).map((l) => l.replace(/^[−-]\s*/, ""));
  const probes = r.interview_probes ?? [];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" aria-label={`${c.name} details`}>
        <div className="drawer-head">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="eyebrow">{applied ? `#${r.rank} · ${ROLE_NAME[role]}` : `Applied for ${c.applied_role} · scored as ${role}`}</div>
              <h2>{c.name}</h2>
              <div className="muted small">{LOC[c.location_flag] ?? LOC.unknown} · {c.file_name}</div>
              <RoleSwitch c={c} run={run} busy={busy} />
            </div>
            <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
              <div className="bigscore">{Math.round(r.total)}<small>/100</small></div>
              <button className="icon-btn" onClick={onClose} aria-label="Close (Esc)">✕</button>
            </div>
          </div>
          <div className="meters">
            {BUCKETS.map((b) => {
              const max = bucketMax(criteria, b.key);
              return (
                <div className="meter-row" key={b.key} title={b.hint}>
                  <span>{b.label}</span>
                  <span className="meter"><span style={{ width: `${max ? (r[b.field] / max) * 100 : 0}%`, background: b.color }} /></span>
                  <span className="num">{r[b.field]}<small>/{max}</small></span>
                </div>
              );
            })}
          </div>
          {(other && other.total > r.total) || r.soft_borderline_flag ? (
            <div className="callouts">
              {other && other.total > r.total && <div className="callout">Scores higher on the {ROLE_NAME[OTHER[role]]} rubric ({Math.round(other.total)}).</div>}
              {r.soft_borderline_flag && <div className="callout">Borderline: only above the invite line because of the writing-style score. Check the quotes under Evidence.</div>}
            </div>
          ) : null}
          <div className="utabs small-tabs" role="tablist">
            {([["summary", "Summary"], ["evidence", "Evidence"], ["interview", "Interview"], ["notes", "Notes"], ["email", "Email"]] as [DrawerTab, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>
                {label}
                {k === "interview" && probes.length > 0 && <span className="count">{probes.length}</span>}
                {k === "notes" && c.notes.length > 0 && <span className="count">{c.notes.length}</span>}
                {k === "email" && c.status === "sent" && <span className="count good">sent</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="drawer-body">
          {view === "summary" && (
            <div className="fit">
              <div><h3>Why they fit</h3><ul className="bullets pro">{pros.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
              <div><h3>Risks</h3><ul className="bullets con">{cons.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
              <AiSignalCard s={c.ai_signal} />
            </div>
          )}

          {view === "evidence" && BUCKETS.map((b) => {
            const items = criteria.filter((k) => k.bucket === b.key);
            if (!items.length) return null;
            return (
              <section className="bucket" key={b.key}>
                <h3><i style={{ background: b.color }} />{b.label}<span className="muted"> · {b.hint}</span></h3>
                {items.map((k) => {
                  const s = byKey.get(k.key);
                  const none = !s || /^none found/i.test(s.evidence);
                  return (
                    <div className="crit" key={k.key} title={`${k.key} · weight ${k.weight}%`}>
                      <div className="crit-top"><span className="crit-name">{k.name}</span><Dots n={s?.score ?? 0} /></div>
                      {none ? <p className="quote none">No evidence in the CV</p>
                        : s!.evidence.split("|").map((q, i) => <p className="quote" key={i}>{q.trim()}</p>)}
                      {s?.reason && <p className="why">{s.reason}</p>}
                    </div>
                  );
                })}
              </section>
            );
          })}

          {view === "interview" && (probes.length ? (
            <ol className="probes">
              {probes.map((p, i) => {
                const m = p.match(/^\[([A-Z]\d)\]\s*/);
                return <li key={i}><p>{m ? p.slice(m[0].length) : p}</p>{m && nameOf.get(m[1]) && <span className="tag">Tests: {nameOf.get(m[1])}</span>}</li>;
              })}
            </ol>
          ) : <p className="muted">Interview questions are written for candidates above the invite line.</p>)}

          {view === "notes" && <TeamNotes c={c} data={data} run={run} busy={busy} />}

          {view === "email" && (
            <>
              {c.status !== "sent" && <PersonalNote c={c} data={data} run={run} busy={busy} />}
              <EmailEditor c={c} data={data} run={run} busy={busy} />
              <div className="danger-zone">
                <button className="btn ghost danger small" disabled={busy} onClick={() => confirm(`Delete ${c.name ?? c.file_name}? This removes their scores and draft.`) && run("Deleting…", () => api(`/api/candidates/${c.id}`, "DELETE"))}>Delete candidate</button>
              </div>
            </>
          )}
        </div>
        <div className="drawer-foot muted small">↑ ↓ to move between candidates · Esc to close</div>
      </aside>
    </>
  );
}

function Attention({ items, run, busy }: { items: CandidateView[]; run: RunFn; busy: boolean }) {
  return (
    <div className="panel attention">
      <h3 style={{ marginTop: 0 }}>Needs your attention</h3>
      {items.map((c) => <AttentionRow key={c.id} c={c} run={run} busy={busy} />)}
    </div>
  );
}

function AttentionRow({ c, run, busy }: { c: CandidateView; run: RunFn; busy: boolean }) {
  const [name, setName] = useState(c.name ?? "");
  const [email, setEmail] = useState(c.email ?? "");
  const [phone, setPhone] = useState(c.phone.join(", "));
  const rescore = async () => {
    const r = await api<{ status: string; detail?: string }>(`/api/candidates/${c.id}/process`);
    if (r.status !== "scored") throw new Error(r.detail ?? r.status);
    const errs = await runRecompute();
    if (errs.length) throw new Error(errs.join("\n"));
  };
  return (
    <div style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <div className="row">
        <b>{c.file_name}</b>
        <span className={`chip ${c.status === "processing" ? "" : "bad"}`}>{c.status.replace("_", " ")}</span>
        <span className="chip">{c.applied_role}</span>
        <span className="spacer" />
        <button className="danger" disabled={busy} onClick={() => confirm(`Delete ${c.file_name}?`) && run("Deleting…", () => api(`/api/candidates/${c.id}`, "DELETE"))}>Delete</button>
      </div>
      {c.status_detail && <div className="small muted" style={{ margin: "4px 0" }}>{c.status_detail}</div>}
      {c.status === "needs_review" ? (
        <div className="row small" style={{ marginTop: 6 }}>
          <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Phones, comma-separated" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button
            className="primary"
            disabled={busy || !name.trim()}
            onClick={() => run("Re-redacting and scoring…", async () => {
              const g = await api<{ ok: boolean; reason?: string }>(`/api/candidates/${c.id}/pii`, "POST", { name, email, phone });
              if (!g.ok) throw new Error(`Still unsafe: ${g.reason}`);
              await rescore();
            })}
          >
            Save & score
          </button>
        </div>
      ) : (
        <button style={{ marginTop: 6 }} disabled={busy} onClick={() => run("Scoring…", rescore)}>Retry scoring</button>
      )}
    </div>
  );
}

function EmailEditor({ c, data, run, busy }: { c: CandidateView; data: DashboardData; run: RunFn; busy: boolean }) {
  const e = c.email_draft;
  const [subject, setSubject] = useState(e?.subject ?? "");
  const [body, setBody] = useState(e?.body ?? "");
  const [confirming, setConfirming] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState(e);
  // Re-sync when the server sends a new draft (e.g. after an override).
  if (e !== lastSeen) {
    setLastSeen(e);
    setSubject(e?.subject ?? "");
    setBody(e?.body ?? "");
  }
  if (!e) return <><h3>Email</h3><p className="muted small">Draft not generated yet.</p></>;

  const sent = c.status === "sent";
  const dirty = subject !== e.subject || body !== e.body;
  const blocked = c.delivery.blocked;
  const toLabel = data.testMode ? `${c.delivery.to} (test inbox)` : c.email ?? "—";
  const flip = e.type === "invite" ? "reject" : "invite";
  const switchTo = (d: "invite" | "reject") => {
    if (d === e.type || sent) return;
    if (dirty && !confirm("This discards your edits and writes a new draft. Continue?")) return;
    run(`Switching to ${d} and redrafting…`, () => api(`/api/candidates/${c.id}/decision`, "POST", { decision: d }));
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <span className="muted small">{e.type === "invite" ? "Interview invite" : "Rejection"}{c.applied_role ? ` · ${c.applied_role} role` : ""}</span>
        <span className="spacer" />
        {sent ? (
          <span className="chip good">Sent {c.sent_at ? new Date(c.sent_at).toLocaleString() : ""}</span>
        ) : (
          <div className="seg" title={c.decision_overridden ? "You overrode the recommendation" : "Recommended by the rubric"}>
            {(["invite", "reject"] as const).map((d) => (
              <button key={d} className={e.type === d ? "on" : ""} disabled={busy} onClick={() => switchTo(d)} style={{ padding: "4px 12px", fontSize: 12.5 }}>
                {d === "invite" ? "Invite" : "Reject"}
              </button>
            ))}
          </div>
        )}
      </div>
      {c.decision_overridden && !sent && <p className="small muted" style={{ margin: "-6px 0 10px" }}>Your call — the rubric recommended {flip === "invite" ? "inviting" : "rejecting"}.</p>}
      <span className="field-label">To</span>
      <div className="small" style={{ overflowWrap: "anywhere" }}>{toLabel}{data.testMode && c.email && <div className="muted">Candidate: {c.email}</div>}</div>
      <span className="field-label">Subject</span>
      <input style={{ width: "100%" }} value={subject} disabled={sent} onChange={(ev) => setSubject(ev.target.value)} />
      <span className="field-label">Message</span>
      <textarea rows={13} value={body} disabled={sent} onChange={(ev) => setBody(ev.target.value)} />
      {(e.last_error || sendErr) && <div className="error">Send failed: {sendErr ?? e.last_error}</div>}
      {!sent && blocked && <div className="error small">{blocked}</div>}
      {!sent && (
        <div className="row" style={{ marginTop: 10 }}>
          {dirty && <button disabled={busy} onClick={() => run("Saving draft…", () => api(`/api/candidates/${c.id}/email`, "PATCH", { subject, body }))}>Save edits</button>}
          <span className="spacer" />
          {!data.emailConfigured ? (
            <button disabled>Email not configured</button>
          ) : (
            <button className="primary" disabled={busy || dirty || !!blocked} title={dirty ? "Save your edits first" : ""} onClick={() => { setSendErr(null); setConfirming(true); }}>
              Send
            </button>
          )}
        </div>
      )}
      {confirming && (
        <div className="dialog-back" onClick={() => setConfirming(false)}>
          <div className="panel dialog" onClick={(ev) => ev.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Send this email?</h2>
            <dl>
              <dt>To</dt><dd><b>{toLabel}</b>{data.testMode && c.email && <div className="small muted">Candidate: {c.email}</div>}</dd>
              <dt>Subject</dt><dd>{e.subject}</dd>
              <dt>Opens with</dt><dd>{e.body.split("\n").find((l) => l.trim())}</dd>
            </dl>
            <div className="row">
              <span className="spacer" />
              <button onClick={() => setConfirming(false)}>Cancel</button>
              <button
                className="primary"
                onClick={() => {
                  setConfirming(false);
                  run("Sending…", async () => {
                    try {
                      await api(`/api/candidates/${c.id}/send`);
                    } catch (x) {
                      setSendErr(x instanceof Error ? x.message : String(x));
                    }
                  });
                }}
              >
                Send now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
