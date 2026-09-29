"use client";
import { useRef, useState } from "react";
import { api, apiUrl, runRecompute } from "@/components/api";
import type { Role } from "@/lib/types";

type Item = { id: number; file: File; role: Role; stage: string; tone: "" | "good" | "bad" | "warn"; detail?: string };
const ACCEPT = ".pdf,.docx,.txt";
const PAUSE_BETWEEN_FILES_MS = 3000; // breathing room for Gemini rate limits on large batches
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function UploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [defaultRole, setDefaultRole] = useState<Role>("PM");
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const add = (files: FileList | null) => {
    if (!files) return;
    const fresh = [...files]
      .filter((f) => /\.(pdf|docx|txt)$/i.test(f.name))
      .map((file) => ({ id: nextId.current++, file, role: defaultRole, stage: "Ready", tone: "" as const }));
    setItems((xs) => [...xs, ...fresh]);
  };
  const patch = (id: number, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function start() {
    setRunning(true);
    const queue = items.filter((x) => x.stage === "Ready");
    let anyScored = false;
    // One file at a time: keeps each request well inside serverless time limits.
    for (const [n, it] of queue.entries()) {
      if (n > 0) {
        patch(it.id, { stage: "Queued — pausing between files…" });
        await sleep(PAUSE_BETWEEN_FILES_MS);
      }
      try {
        patch(it.id, { stage: "Uploading & removing personal details…", tone: "" });
        const fd = new FormData();
        fd.append("file", it.file);
        fd.append("role", it.role);
        const res = await fetch(apiUrl("/api/upload"), { method: "POST", body: fd });
        const up = await res.json();
        if (!res.ok || up.error) throw new Error(up.error ?? `HTTP ${res.status}`);
        if (up.status === "needs_review") {
          patch(it.id, { stage: "Needs review", tone: "warn", detail: `${up.status_detail} Fix it on the dashboard.` });
          continue;
        }
        patch(it.id, { stage: "Scoring against PM + SPM rubrics…" });
        const pr = await api<{ status: string; detail?: string }>(`/api/candidates/${up.id}/process`);
        if (pr.status !== "scored") {
          patch(it.id, { stage: pr.status === "needs_review" ? "Needs review" : "Scoring failed", tone: pr.status === "needs_review" ? "warn" : "bad", detail: pr.detail });
          continue;
        }
        anyScored = true;
        patch(it.id, { stage: "Scored", tone: "good" });
      } catch (e) {
        patch(it.id, { stage: "Failed", tone: "bad", detail: e instanceof Error ? e.message : String(e) });
      }
    }
    if (anyScored) {
      setItems((xs) => xs.map((x) => (x.stage === "Scored" ? { ...x, stage: "Ranking & drafting emails…" } : x)));
      try {
        const errs = await runRecompute();
        setItems((xs) => xs.map((x) => (x.stage === "Ranking & drafting emails…" ? { ...x, stage: "Done", tone: errs.length ? "warn" : "good", detail: errs.length ? errs.join("; ") : undefined } : x)));
      } catch (e) {
        setItems((xs) => xs.map((x) => (x.stage === "Ranking & drafting emails…" ? { ...x, stage: "Scored; drafting failed", tone: "warn", detail: String(e) } : x)));
      }
    }
    setRunning(false);
  }

  const ready = items.filter((x) => x.stage === "Ready").length;
  const doneCount = items.filter((x) => !["Ready", "Queued — pausing between files…"].includes(x.stage) && !x.stage.endsWith("…")).length;
  return (
    <>
      <h1>Upload CVs</h1>
      <div
        className={`drop panel ${over ? "over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <b>Drop CVs here</b> or click to choose — .pdf, .docx, .txt
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>

      <div className="row" style={{ margin: "12px 0" }}>
        <span className="small muted">Default role for new files:</span>
        <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as Role)}>
          <option value="PM">PM</option>
          <option value="SPM">SPM</option>
        </select>
        {items.length > 0 && (
          <button className="small" disabled={running} onClick={() => setItems((xs) => xs.map((x) => (x.stage === "Ready" ? { ...x, role: defaultRole } : x)))}>
            Set all to {defaultRole}
          </button>
        )}
        <span className="spacer" />
        {running && <span className="small muted">{doneCount} of {items.length} processed</span>}
        <button className="primary" disabled={running || !ready} onClick={start}>
          {running ? "Processing…" : `Process ${ready} file${ready === 1 ? "" : "s"}`}
        </button>
      </div>

      {items.length > 0 && (
        <div className="panel">
          <table>
            <thead><tr><th>File</th><th>Applied for</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.file.name}</td>
                  <td>
                    <select value={it.role} disabled={it.stage !== "Ready"} onChange={(e) => patch(it.id, { role: e.target.value as Role })}>
                      <option value="PM">PM</option>
                      <option value="SPM">SPM</option>
                    </select>
                  </td>
                  <td>
                    <span className={`chip ${it.tone}`}>{it.stage}</span>
                    {it.detail && <div className="small muted">{it.detail}</div>}
                  </td>
                  <td>{it.stage === "Ready" && <button className="small" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.some((x) => x.stage === "Done") && !running && <p><a href="/">Open the dashboard →</a></p>}
    </>
  );
}
