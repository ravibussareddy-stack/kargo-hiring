"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Criterion, Role } from "@/lib/types";
import { api, runRecompute, runRecomputeDetailed } from "./api";

const BUCKET: Record<string, string> = {
  requirements: "Requirements",
  pattern_hard: "Arjun's pattern — hard",
  pattern_soft: "Arjun's pattern — soft",
  trust: "Trust & ownership",
};

export default function RubricEditor({ criteria, rescoreIds }: { criteria: Criterion[]; rescoreIds: string[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(criteria);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "notice" | "ok" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const sum = (role: Role) => Math.round(rows.filter((r) => r.role === role).reduce((s, r) => s + Number(r.weight || 0), 0) * 10) / 10;
  const valid = sum("PM") === 100 && sum("SPM") === 100;
  const set = (id: string, p: Partial<Criterion>) => setRows((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ weightChanged: boolean; wordingChanged: boolean; retotalled: number }>("/api/rubric", "PUT", {
        criteria: rows.map(({ id, name, weight, strong_description, weak_description }) => ({ id, name, weight: Number(weight), strong_description, weak_description })),
      });
      setEditing(false);
      const parts: string[] = [];
      if (r.weightChanged) {
        setMsg({ tone: "notice", text: "Weights saved. Updating totals, ranking and emails…" });
        const { errors, changed } = await runRecomputeDetailed();
        if (errors.length) throw new Error(errors.join("\n"));
        parts.push(`New weights applied instantly: ${r.retotalled} score${r.retotalled === 1 ? "" : "s"} updated, ${changed} invite/reject decision${changed === 1 ? "" : "s"} changed.`);
      }
      if (r.wordingChanged) parts.push("You changed criterion wording. That only affects how the AI reads CVs, so click “Re-score all” to apply it.");
      setMsg({ tone: r.wordingChanged ? "warn" : "ok", text: parts.join("\n") || "Saved. Nothing that affects scores changed." });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function rescoreAll() {
    if (!confirm(`Re-score ${rescoreIds.length} candidate(s) with the current rubric? This makes ~2-4 AI calls each.`)) return;
    setBusy(true);
    const failed: string[] = [];
    for (const [i, id] of rescoreIds.entries()) {
      setMsg({ tone: "notice", text: `Re-scoring ${i + 1} of ${rescoreIds.length}…` });
      const r = await api<{ status: string; detail?: string }>(`/api/candidates/${id}/process`).catch((e) => ({ status: "error", detail: String(e) }));
      if (r.status !== "scored") failed.push(r.detail ?? r.status);
    }
    setMsg({ tone: "notice", text: "Re-ranking and redrafting…" });
    const errs = await runRecompute().catch((e) => [String(e)]);
    setMsg({ tone: failed.length || errs.length ? "error" : "notice", text: failed.length || errs.length ? [...failed, ...errs].join("\n") : "Re-scored everyone." });
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Rubric</h1>
        <span className="spacer" />
        {editing ? (
          <>
            <button disabled={busy} onClick={() => { setRows(criteria); setEditing(false); setMsg(null); }}>Cancel</button>
            <button className="primary" disabled={busy || !valid} onClick={save}>Save</button>
          </>
        ) : (
          <>
            <button disabled={busy || rescoreIds.length === 0} onClick={rescoreAll}>Re-score all ({rescoreIds.length})</button>
            <button onClick={() => setEditing(true)}>Edit</button>
          </>
        )}
      </div>
      <p className="small muted">
        Each criterion is scored 0–5 by the AI. Total = Σ (score ÷ 5) × weight, worked out in code. Weights must add up to 100 per role.
        Weight changes apply instantly. Wording changes need “Re-score all”, because they change how the AI reads each CV.
      </p>
      {msg && <div className={msg.tone === "error" ? "error" : msg.tone === "ok" ? "success" : "notice"} style={{ whiteSpace: "pre-line" }}>{msg.text}</div>}

      {(["PM", "SPM"] as Role[]).map((role) => (
        <div key={role}>
          <h2>
            {role === "PM" ? "Product Manager" : "Senior Product Manager"}{" "}
            <span className={`chip ${sum(role) === 100 ? "good" : "bad"}`}>weights = {sum(role)}%</span>
          </h2>
          <div className="panel">
            <table>
              <thead><tr><th style={{ width: 200 }}>Criterion</th><th style={{ width: 70 }}>Weight</th><th>Strong</th><th>Weak</th></tr></thead>
              <tbody>
                {rows.filter((r) => r.role === role).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="small muted">{r.key} · {BUCKET[r.bucket]}</div>
                      {editing ? <input style={{ width: "100%" }} value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} /> : <b>{r.name}</b>}
                    </td>
                    <td>{editing ? <input style={{ width: 60 }} type="number" min={0} step={0.5} value={r.weight} onChange={(e) => set(r.id, { weight: e.target.value as unknown as number })} /> : `${r.weight}%`}</td>
                    <td className="small">{editing ? <textarea rows={5} value={r.strong_description} onChange={(e) => set(r.id, { strong_description: e.target.value })} /> : r.strong_description}</td>
                    <td className="small">{editing ? <textarea rows={5} value={r.weak_description} onChange={(e) => set(r.id, { weak_description: e.target.value })} /> : r.weak_description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
