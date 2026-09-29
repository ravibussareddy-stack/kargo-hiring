"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateView, DashboardData } from "@/lib/dashboard";
import { api } from "./api";
import { Drawer, useAuthor, type RunFn } from "./Dashboard";

type Stage = CandidateView["interview_stage"];
const LANES: { key: Stage; title: string; hint: string }[] = [
  { key: "invited", title: "Invited", hint: "Awaiting a reply to schedule" },
  { key: "wip", title: "In progress", hint: "Interviews under way" },
  { key: "dropped", title: "Dropped off", hint: "Left the process" },
];
const DROP_REASONS = ["No response", "Withdrew", "Accepted another offer", "Not a fit after interview", "Other"];

export default function Interviews({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [author, setAuthor] = useAuthor();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dropping, setDropping] = useState<CandidateView | null>(null);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 5000); return () => clearTimeout(t); }, [flash]);

  const run: RunFn = async (label, fn) => {
    setBusy(label); setErr(null); setFlash(null);
    try { const r = await fn(); if (typeof r === "string") setFlash(r); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); router.refresh(); }
  };

  const invited = data.candidates
    .filter((c) => c.decision === "invite" && (c.status === "scored" || c.status === "sent"))
    .sort((a, b) => b.results[b.applied_role]!.total - a.results[a.applied_role]!.total);
  const lane = (k: Stage) => invited.filter((c) => c.interview_stage === k);
  const current = invited.find((c) => c.id === selected) ?? null;

  const move = (c: CandidateView, stage: Stage, reason?: string) =>
    run(`Moving ${c.name}…`, async () => {
      await api(`/api/candidates/${c.id}/stage`, "POST", { stage, reason, author });
      return `${c.name} → ${LANES.find((l) => l.key === stage)!.title}`;
    });

  return (
    <>
      <header className="page-head">
        <div>
          <div className="welcome">Interviews</div>
          <h1>Interview pipeline</h1>
          <p className="muted">
            {invited.length} invited · {lane("wip").length} in progress · {lane("dropped").length} dropped off
          </p>
        </div>
        <label className="small muted row" style={{ gap: 6 }}>
          Moves logged as <input style={{ width: 130, padding: "5px 8px" }} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
      </header>

      {!data.stagesReady && <p className="notice">Interview tracking needs one database update: run <code>supabase/migrations/005_interview_stage.sql</code> in Supabase.</p>}
      {busy && <div className="toast"><span className="spinner" />{busy}</div>}
      {!busy && flash && <div className="toast done" onClick={() => setFlash(null)}>✓ {flash}</div>}
      {err && <div className="error">{err}</div>}

      {invited.length === 0 ? (
        <div className="empty"><p>No one is marked Invite yet.</p><a className="btn primary" href="/">Go to candidates</a></div>
      ) : (
        <div className="board">
          {LANES.map((l) => (
            <section key={l.key} className={`lane lane-${l.key}`}>
              <div className="lane-head">
                <b>{l.title}</b><span className="count">{lane(l.key).length}</span>
                <div className="muted small">{l.hint}</div>
              </div>
              {lane(l.key).length === 0 && <p className="lane-empty">Nobody here.</p>}
              {lane(l.key).map((c) => (
                <InterviewCard key={c.id} c={c} busy={!!busy || !data.stagesReady} onOpen={() => setSelected(c.id)} onMove={move} onDrop={() => setDropping(c)} />
              ))}
            </section>
          ))}
        </div>
      )}

      {dropping && <DropDialog c={dropping} onCancel={() => setDropping(null)} onConfirm={(reason) => { const c = dropping; setDropping(null); move(c, "dropped", reason); }} />}

      {current && (
        <Drawer key={current.id} c={current} role={current.applied_role} criteria={data.criteria.filter((k) => k.role === current.applied_role)}
          data={data} run={run} busy={!!busy} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function InterviewCard({ c, busy, onOpen, onMove, onDrop }: {
  c: CandidateView; busy: boolean; onOpen: () => void; onMove: (c: CandidateView, s: Stage) => void; onDrop: () => void;
}) {
  const r = c.results[c.applied_role]!;
  const sent = c.status === "sent";
  const lastNote = [...c.notes].reverse().find((n) => !/^Moved to /.test(n.body));
  const since = c.interview_stage_at ? new Date(c.interview_stage_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;
  return (
    <article className="icard" onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="name">{c.name}</div>
          <div className="muted small">{c.applied_role} · #{r.rank} · {Math.round(r.total)}/100</div>
        </div>
        <span className={`pill ${sent ? "good" : ""}`} title={sent ? "Invite email sent" : "Invite drafted, not sent yet"}>{sent ? "✓ Invite sent" : "Not sent"}</span>
      </div>
      {c.interview_stage === "dropped" && <p className="drop-reason">{c.drop_reason}</p>}
      {lastNote && <p className="last-note">“{lastNote.body.length > 110 ? lastNote.body.slice(0, 110) + "…" : lastNote.body}” <span className="faint">— {lastNote.author}</span></p>}
      <div className="icard-foot" onClick={(e) => e.stopPropagation()}>
        {since && <span className="faint small">since {since}</span>}
        <span className="spacer" />
        {c.interview_stage === "invited" && <button className="btn small primary" disabled={busy} onClick={() => onMove(c, "wip")}>Start interview</button>}
        {c.interview_stage === "wip" && <button className="btn small ghost" disabled={busy} onClick={() => onMove(c, "invited")}>Back to invited</button>}
        {c.interview_stage !== "dropped"
          ? <button className="btn small ghost danger" disabled={busy} onClick={onDrop}>Drop off</button>
          : <button className="btn small" disabled={busy} onClick={() => onMove(c, "wip")}>Reinstate</button>}
      </div>
    </article>
  );
}

function DropDialog({ c, onCancel, onConfirm }: { c: CandidateView; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(DROP_REASONS[0]);
  const [detail, setDetail] = useState("");
  const full = reason === "Other" ? detail.trim() || "Other" : detail.trim() ? `${reason}: ${detail.trim()}` : reason;
  return (
    <div className="dialog-back" onClick={onCancel}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Mark {c.name} as dropped off?</h2>
        <p className="muted small">They move to “Dropped off”. You can reinstate them later. Nothing is emailed.</p>
        <span className="field-label">Reason</span>
        <div className="reasons">
          {DROP_REASONS.map((r) => (
            <button key={r} type="button" className={reason === r ? "on" : ""} onClick={() => setReason(r)}>{r}</button>
          ))}
        </div>
        <span className="field-label">Details (optional)</span>
        <textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. Took an offer at a larger 3PL" />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={() => onConfirm(full)}>Mark dropped off</button>
        </div>
      </div>
    </div>
  );
}
