"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateView, DashboardData } from "@/lib/dashboard";
import type { Criterion, Role } from "@/lib/types";
import { api, runRecompute } from "./api";

const OTHER: Record<Role, Role> = { PM: "SPM", SPM: "PM" };
const LOC: Record<string, { label: string; cls: string }> = {
  mumbai: { label: "Mumbai", cls: "good" },
  relocating: { label: "Relocating to Mumbai", cls: "good" },
  other: { label: "Other city", cls: "warn" },
  unknown: { label: "Location unknown", cls: "" },
};

export default function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Role>("PM");
  const [everyone, setEveryone] = useState(false);
  const [cutoff, setCutoff] = useState(String(data.cutoff));
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
  const applicantsScored = list.filter((c) => c.applied_role === tab).length;

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="tabs">
          {(["PM", "SPM"] as Role[]).map((r) => (
            <button key={r} className={tab === r ? "on" : ""} onClick={() => setTab(r)}>
              {r === "PM" ? "Product Manager" : "Senior PM"} ({data.candidates.filter((c) => c.applied_role === r).length})
            </button>
          ))}
        </div>
        <label className="row small">
          <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
          Show everyone scored against this rubric
        </label>
        <span className="spacer" />
        <label className="row small">
          Invite top
          <input style={{ width: 56 }} type="number" min={0} value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
          <button
            disabled={!!busy || cutoff === String(data.cutoff)}
            onClick={() => run("Updating cut-off and redrafting…", async () => {
              await api("/api/settings", "PUT", { invite_cutoff: Number(cutoff) });
              const errs = await runRecompute();
              if (errs.length) throw new Error(errs.join("\n"));
            })}
          >
            Save
          </button>
        </label>
      </div>

      {busy && <div className="notice">{busy}</div>}
      {err && <div className="error">{err}</div>}
      {!data.emailConfigured && <div className="notice small">Email not configured: set RESEND_API_KEY and RESEND_FROM_ADDRESS to enable sending.</div>}

      {attention.length > 0 && <Attention items={attention} run={run} busy={!!busy} />}

      {list.length === 0 && <p className="muted">No scored candidates yet. <a href="/upload">Upload CVs</a>.</p>}
      {list.map((c, i) => (
        <div key={c.id}>
          {!everyone && i === data.cutoff && applicantsScored > data.cutoff && (
            <div className="cutline"><span>Invite cut-off (top {data.cutoff})</span></div>
          )}
          <Card c={c} role={tab} criteria={criteria} data={data} run={run} busy={!!busy} position={i + 1} />
        </div>
      ))}
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

function Card({ c, role, criteria, data, run, busy, position }: {
  c: CandidateView; role: Role; criteria: Criterion[]; data: DashboardData; run: RunFn; busy: boolean; position: number;
}) {
  const [open, setOpen] = useState(false);
  const r = c.results[role]!;
  const other = c.results[OTHER[role]];
  const betterElsewhere = other && other.total > r.total;
  const loc = LOC[c.location_flag] ?? LOC.unknown;
  const byKey = new Map(r.scores.map((s) => [s.criterion_key, s]));
  const soft = criteria.filter((k) => k.bucket === "pattern_soft");

  return (
    <div className="panel card">
      <div className="card-head" onClick={() => setOpen(!open)}>
        <div className="rank">{c.applied_role === role ? `#${r.rank ?? position}` : "–"}</div>
        <div>
          <div className="row">
            <b>{c.name ?? "(no name)"}</b>
            <span className="chip">Applied: {c.applied_role}</span>
            <span className={`chip ${loc.cls}`}>{loc.label}</span>
            {c.applied_role === role && c.decision && (
              <span className={`chip ${c.decision === "invite" ? "good" : ""}`}>
                {c.decision === "invite" ? "Invite" : "Reject"}{c.decision_overridden ? " (your call)" : ""}
              </span>
            )}
            {r.soft_borderline_flag && <span className="chip warn" title="Only above the cut-off because of B3 (language). Judge the quoted phrases yourself.">Borderline — soft signal</span>}
            {betterElsewhere && <span className="chip warn">Scores higher on {OTHER[role]} ({other!.total})</span>}
            <StatusBadge c={c} />
          </div>
          <div className="subs" style={{ marginTop: 4 }}>
            <span>Req <b>{r.requirements_subtotal}</b>/70</span>
            <span>Pattern hard <b>{r.pattern_hard_subtotal}</b>/14</span>
            <span>Pattern soft <b>{r.pattern_soft_subtotal}</b>/6</span>
            <span>Trust <b>{r.trust_subtotal}</b>/10</span>
          </div>
        </div>
        <div className="total">{r.total}<span className="small muted">/100</span></div>
      </div>

      {open && (
        <div className="card-body">
          <h3>Fit brief</h3>
          <p className="brief">{r.brief ?? "—"}</p>

          {soft.map((k) => {
            const s = byKey.get(k.key);
            return (
              <div key={k.key}>
                <h3>{k.key} language — judge the tone yourself ({s?.score ?? 0}/5)</h3>
                {(s?.evidence ?? "none found").split("|").map((q, i) => <span key={i} className="quote">“{q.trim()}”</span>)}
                <div className="small muted">{s?.reason}</div>
              </div>
            );
          })}

          <h3>Criteria</h3>
          <table>
            <thead><tr><th>Criterion</th><th>Score</th><th>Evidence</th><th>Reason</th></tr></thead>
            <tbody>
              {criteria.map((k) => {
                const s = byKey.get(k.key);
                return (
                  <tr key={k.key}>
                    <td><b>{k.key}</b> {k.name} <span className="muted small">({k.weight}%)</span></td>
                    <td className="score">{s?.score ?? "–"}/5</td>
                    <td className="evidence">{s?.evidence}</td>
                    <td>{s?.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {r.interview_probes && r.interview_probes.length > 0 && (
            <>
              <h3>Interview probes</h3>
              <ol style={{ margin: 0, paddingLeft: 20 }}>{r.interview_probes.map((p, i) => <li key={i}>{p}</li>)}</ol>
            </>
          )}

          <EmailEditor c={c} data={data} run={run} busy={busy} />

          <div className="row" style={{ marginTop: 14 }}>
            <span className="small muted">{c.file_name}</span>
            <span className="spacer" />
            <button className="danger small" disabled={busy} onClick={() => confirm(`Delete ${c.name ?? c.file_name}? This removes their scores and draft.`) && run("Deleting…", () => api(`/api/candidates/${c.id}`, "DELETE"))}>Delete candidate</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ c }: { c: CandidateView }) {
  if (c.status === "sent") return <span className="chip good">Sent {c.sent_at ? new Date(c.sent_at).toLocaleString() : ""}</span>;
  if (c.email_draft?.status === "failed") return <span className="chip bad">Failed</span>;
  if (c.email_draft) return <span className="chip">Draft</span>;
  return null;
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
  if (!e) return <><h3>Email</h3><p className="muted">Draft not generated yet.</p></>;

  const sent = c.status === "sent";
  const dirty = subject !== e.subject || body !== e.body;
  const domain = c.email?.split("@")[1]?.toLowerCase();
  const blocked = !c.email ? "No email address found in CV." : !data.allowedDomains.includes(domain ?? "") ? `Blocked: ${domain} is not in ALLOWED_RECIPIENT_DOMAINS.` : null;
  const flip = e.type === "invite" ? "reject" : "invite";

  return (
    <>
      <h3>Email — {e.type === "invite" ? "interview invite" : "rejection"} (for {c.applied_role})</h3>
      <div className="row small" style={{ marginBottom: 6 }}>
        To: <b>{c.email ?? "—"}</b>
        <span className="spacer" />
        {!sent && (
          <button
            disabled={busy}
            onClick={() => (!dirty || confirm("This discards your edits and writes a new draft. Continue?")) &&
              run(`Switching to ${flip} and redrafting…`, () => api(`/api/candidates/${c.id}/decision`, "POST", { decision: flip }))}
          >
            Switch to {flip === "invite" ? "Invite" : "Reject"}
          </button>
        )}
      </div>
      <input style={{ width: "100%", marginBottom: 6 }} value={subject} disabled={sent} onChange={(ev) => setSubject(ev.target.value)} />
      <textarea rows={10} value={body} disabled={sent} onChange={(ev) => setBody(ev.target.value)} />
      {(e.last_error || sendErr) && <div className="error">Send failed: {sendErr ?? e.last_error}</div>}
      {!sent && blocked && <div className="error small">{blocked}</div>}
      {!sent && (
        <div className="row" style={{ marginTop: 6 }}>
          <button disabled={busy || !dirty} onClick={() => run("Saving draft…", () => api(`/api/candidates/${c.id}/email`, "PATCH", { subject, body }))}>Save edits</button>
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
            <p><span className="muted">To:</span> <b>{c.email}</b></p>
            <p><span className="muted">Subject:</span> {e.subject}</p>
            <p><span className="muted">First line:</span> {e.body.split("\n").find((l) => l.trim())}</p>
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
