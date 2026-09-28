// Uploads a folder of CVs through the running app's API, one at a time, like /upload does.
// Usage: npm run batch -- <folder> <PM|SPM|auto> [baseUrl]
//   auto: files starting pm_ -> PM, spm_ -> SPM; others are skipped.
import { readFileSync, readdirSync } from "node:fs";

const [dir, roleArg = "auto", base = "http://localhost:3000"] = process.argv.slice(2);
if (!dir) { console.error("Usage: npm run batch -- <folder> <PM|SPM|auto> [baseUrl]"); process.exit(1); }
const auth = "Basic " + Buffer.from(`${process.env.DASHBOARD_USER || "arjun"}:${process.env.DASHBOARD_PASSWORD ?? ""}`).toString("base64");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const post = async (path: string, body?: FormData) => {
  const r = await fetch(base + path, { method: "POST", headers: { authorization: auth }, body });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok || j.error) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
};

const files = readdirSync(dir).filter((f) => /\.(pdf|docx|txt)$/i.test(f)).sort();
const counts: Record<string, number> = {};
for (const [i, f] of files.entries()) {
  const role = roleArg === "auto" ? (/^spm_/i.test(f) ? "SPM" : /^pm_/i.test(f) ? "PM" : null) : roleArg;
  if (!role) { console.log(`skip  ${f} (role unknown)`); continue; }
  if (i > 0) await sleep(3000);
  const t0 = Date.now();
  try {
    const fd = new FormData();
    fd.append("file", new Blob([readFileSync(`${dir}/${f}`)]), f);
    fd.append("role", role);
    const up = await post("/api/upload", fd);
    const res = up.status === "needs_review" ? { status: "needs_review", detail: up.status_detail } : await post(`/api/candidates/${up.id}/process`);
    counts[res.status] = (counts[res.status] ?? 0) + 1;
    console.log(`${res.status.padEnd(14)} ${role.padEnd(3)} ${f} (${((Date.now() - t0) / 1000).toFixed(1)}s)${res.detail ? " — " + res.detail : ""}`);
  } catch (e) {
    counts.error = (counts.error ?? 0) + 1;
    console.log(`error          ${role.padEnd(3)} ${f} — ${(e as Error).message}`);
  }
}
console.log("\nRanking and drafting emails…");
for (let i = 0; i < 20; i++) {
  const r = await post("/api/recompute");
  if (r.errors.length) console.log("  errors:", r.errors.join(" | "));
  console.log(`  pending: ${r.pending}`);
  if (!r.pending) break;
}
console.log("\nDone:", JSON.stringify(counts));
