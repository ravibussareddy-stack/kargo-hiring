"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateView, DashboardData, RoleResult } from "@/lib/dashboard";
import type { Criterion, Role } from "@/lib/types";
import { api, runRecompute } from "./api";

const OTHER: Record<Role, Role> = { PM: "SPM", SPM: "PM" };
const LOC: Record<string, { label: string; cls: string }> = {
  mumbai: { label: "Mumbai", cls: "good" },
  relocating: { label: "Relocating to Mumbai", cls: "good" },
  other: { label: "Outside Mumbai", cls: "warn" },
  unknown: { label: "Location unknown", cls: "" },
};

export default function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Role>("PM");
  const [everyone, setEveryone] = useState(false);
  const [cutoff, setCutoff] = useState(String(data.cutoff));
  const [minScore, setMinScore] = useState(String(data.settings.min_invite_score));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
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
  const lastInviteIdx = list.reduce((acc, c, i) => {
    const r = c.results[tab]!;
    return c.applied_role === tab && r.rank !== null && r.rank <= data.cutoff && r.total >= data.settings.min_invite_score ? i : acc;
  }, -1);

  const [ruleOpen, setRuleOpen] = useState(false);
  const inviteCount = list.filter((c) => c.applied_role === tab && c.decision === "invite").length;

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {(["PM", "SPM"] as Role[]).map((r) => (
            <button key={r} className={tab === r ? "on" : ""} onClick={() => setTab(r)}>
              {r === "PM" ? "Product Manager" : "Senior PM"}
              <span className="count">{data.candidates.filter((c) => c.applied_role === r).length}</span>
            </button>
          ))}
        </div>
        <label className="row small muted" style={{ gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
          Include {OTHER[tab]} applicants
        </label>
        <span className="spacer" />
        <div style={{ position: "relative" }}>
          <button onClick={() => setRuleOpen(!ruleOpen)}>
            Invite rule: <b>top {data.cutoff}</b> · <b>≥ {data.settings.min_invite_score}</b>
          </button>
          {ruleOpen && (
            <div className="panel rule-pop">
              <label>Invite the top <input type="number" min={0} value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></label>
              <label>Minimum score <input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} /></label>
              {!data.settings.min_score_migrated && (
                <p className="small muted" style={{ margin: "0 0 10px" }}>Minimum is fixed at 50 until <code>002_min_invite_score.sql</code> is run.</p>
              )}
              <p className="small muted" style={{ margin: "0 0 12px" }}>Saving re-ranks everyone and redrafts emails that change. Sent emails are never touched.</p>
              <div className="row">
                <span className="spacer" />
                <button className="ghost" onClick={() => setRuleOpen(false)}>Cancel</button>
                <button
                  className="primary"
                  disabled={!!busy || (cutoff === String(data.cutoff) && minScore === String(data.settings.min_invite_score))}
                  onClick={() => { setRuleOpen(false); run("Updating invite rule and redrafting…", async () => {
                    await api("/api/settings", "PUT", { invite_cutoff: Number(cutoff), min_invite_score: Number(minScore) });
                    const errs = await runRecompute();
                    if (errs.length) throw new Error(errs.join("\n"));
                  }); }}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="banner">
        <span>{list.length} candidates · {inviteCount} to invite</span>
        {data.testMode && <><span>·</span><span className="dot" /><span>Test mode: emails go to the test inbox</span></>}
        {!data.emailConfigured && <><span>·</span><span>Email sending not configured</span></>}
      </div>

      {busy && <div className="notice">{busy}</div>}
      {err && <div className="error">{err}</div>}

      {attention.length > 0 && <Attention items={attention} run={run} busy={!!busy} />}

      {list.length === 0 && <p className="muted">No scored candidates yet. <a href="/upload">Upload CVs</a>.</p>}
      <div className="list">
        {list.map((c, i) => (
          <div key={c.id}>
            {!everyone && i === lastInviteIdx + 1 && i > 0 && (
              <div className="cutline">Invite line · top {data.cutoff} scoring ≥ {data.settings.min_invite_score}</div>
            )}
            <Card c={c} role={tab} criteria={criteria} data={data} run={run} busy={!!busy} position={i + 1} />
          </div>
        ))}
      </div>
    </>
  );
}

type RunFn = (label: string, fn: () => Promise<unknown>) => Promise<void>;

function Attention({ items, run, busy }: { items: CandidateView[]; run: RunFn; busy: boolean }) {
  return (
    <div className="panel" style={{ padding: 14, marginBottom: 16 }}>
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

const BUCKETS: { key: Criterion["bucket"]; label: string; hint: string; color: string; field: "requirements_subtotal" | "pattern_hard_subtotal" | "pattern_soft_subtotal" | "trust_subtotal" }[] = [
  { key: "requirements", label: "Role requirements", hint: "From the job description", color: "var(--b-req)", field: "requirements_subtotal" },
  { key: "pattern_hard", label: "Arjun's pattern: track record", hint: "What his best hires had done", color: "var(--b-hard)", field: "pattern_hard_subtotal" },
  { key: "pattern_soft", label: "Arjun's pattern: how they write", hint: "Judge the quoted phrases yourself", color: "var(--b-soft)", field: "pattern_soft_subtotal" },
  { key: "trust", label: "Trust & ownership", hint: "Owns outcomes, including failures", color: "var(--b-trust)", field: "trust_subtotal" },
];

function Dots({ n }: { n: number }) {
  const color = n >= 4 ? "var(--good)" : n >= 2 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="dots" title={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} style={i <= n ? { background: color } : undefined} />)}
    </div>
  );
}

function ScoreStack({ r, criteria }: { r: RoleResult; criteria: Criterion[] }) {
  return (
    <div className="stack" title={BUCKETS.map((b) => `${b.label}: ${r[b.field]}/${bucketMax(criteria, b.key)}`).join("\n")}>
      {BUCKETS.map((b) => <span key={b.key} style={{ width: `${r[b.field]}%`, background: b.color }} />)}
    </div>
  );
}

const bucketMax = (criteria: Criterion[], bucket: Criterion["bucket"]) => criteria.filter((c) => c.bucket === bucket).reduce((s, c) => s + c.weight, 0);

function Card({ c, role, criteria, data, run, busy, position }: {
  c: CandidateView; role: Role; criteria: Criterion[]; data: DashboardData; run: RunFn; busy: boolean; position: number;
}) {
  const [open, setOpen] = useState(false);
  const r = c.results[role]!;
  const other = c.results[OTHER[role]];
  const betterElsewhere = other && other.total > r.total;
  const loc = LOC[c.location_flag] ?? LOC.unknown;
  const byKey = new Map(r.scores.map((s) => [s.criterion_key, s]));
  const nameOf = new Map(criteria.map((k) => [k.key, k.name]));
  const applied = c.applied_role === role;
  const invited = applied && c.decision === "invite";
  const lines = (r.brief ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const pros = lines.filter((l) => l.startsWith("+")).map((l) => l.replace(/^\+\s*/, ""));
  const cons = lines.filter((l) => !l.startsWith("+")).map((l) => l.replace(/^[−-]\s*/, ""));

  return (
    <div className={`panel cand ${open ? "open" : ""}`}>
      <div className="cand-head" onClick={() => setOpen(!open)}>
        <div className={`rank ${invited ? "top" : ""}`}>{applied ? r.rank ?? position : "–"}</div>
        <div className="who">
          <b>{c.name ?? "(no name)"}</b>
          <div className="meta">
            <span>{loc.label}</span>
            {!applied && <><span>·</span><span>Applied for {c.applied_role}</span></>}
            {betterElsewhere && <span className="chip warn">Stronger on {OTHER[role]} · {other!.total}</span>}
            {r.soft_borderline_flag && <span className="chip warn" title="Only above the invite line because of the writing-style score">Borderline</span>}
          </div>
        </div>
        <div className="stack-wrap"><ScoreStack r={r} criteria={criteria} /></div>
        <div className="big">{Math.round(r.total)}</div>
        <div className="decision" style={{ textAlign: "right" }}><StatusBadge c={c} applied={applied} /></div>
        <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>

      {open && (
        <div className="cand-body">
          <div className="cand-main">
            <div className="fit">
              <div className="pro"><h3>Why they fit</h3><ul>{pros.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
              <div className="con"><h3>Risks</h3><ul>{cons.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
            </div>

            {BUCKETS.map((b) => {
              const items = criteria.filter((k) => k.bucket === b.key);
              if (!items.length) return null;
              return (
                <div className="bucket" key={b.key}>
                  <div className="bucket-head">
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, alignSelf: "center" }} />
                    <h3 title={b.hint}>{b.label}</h3>
                    <span className="sub">{r[b.field]}<span> / {bucketMax(criteria, b.key)}</span></span>
                  </div>
                  {items.map((k) => {
                    const s = byKey.get(k.key);
                    const none = !s || /^none found/i.test(s.evidence);
                    return (
                      <div className="crit" key={k.key} title={`${k.key} · weight ${k.weight}%`}>
                        <div className="name">{k.name}<small>{k.weight}%</small></div>
                        <Dots n={s?.score ?? 0} />
                        <div className={`quote ${none ? "none" : ""}`}>
                          {none ? "No evidence in the CV" : s!.evidence.split("|").map((q) => `“${q.trim()}”`).join("  ")}
                        </div>
                        {s?.reason && <div className="why">{s.reason}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {r.interview_probes && r.interview_probes.length > 0 && (
              <div className="bucket">
                <h3>Interview questions</h3>
                <ol className="probes">
                  {r.interview_probes.map((p, i) => {
                    const m = p.match(/^\[([A-Z]\d)\]\s*/);
                    return <li key={i}><div>{m ? p.slice(m[0].length) : p}{m && nameOf.get(m[1]) && <span className="tag">Tests: {nameOf.get(m[1])}</span>}</div></li>;
                  })}
                </ol>
              </div>
            )}
          </div>

          <div className="cand-side">
            <div className="side-sticky">
              <EmailEditor c={c} data={data} run={run} busy={busy} />
              <div className="row" style={{ marginTop: 22 }}>
                <span className="small muted" style={{ overflowWrap: "anywhere" }}>{c.file_name}</span>
                <span className="spacer" />
                <button className="ghost small danger" disabled={busy} onClick={() => confirm(`Delete ${c.name ?? c.file_name}? This removes their scores and draft.`) && run("Deleting…", () => api(`/api/candidates/${c.id}`, "DELETE"))}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ c, applied }: { c: CandidateView; applied: boolean }) {
  if (c.status === "sent") return <span className="chip good" title={c.sent_at ? new Date(c.sent_at).toLocaleString() : ""}>Sent</span>;
  if (c.email_draft?.status === "failed") return <span className="chip bad">Send failed</span>;
  if (!applied || !c.decision) return null;
  return c.decision === "invite" ? <span className="chip accent">Invite</span> : <span className="chip">Reject</span>;
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
        <h3 style={{ margin: 0 }}>Email</h3>
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
