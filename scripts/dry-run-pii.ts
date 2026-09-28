// No-AI dry run of the PII step over a folder of CVs: name detection, guard, location, redaction loss.
// Usage: npm run dry-run -- <cv-folder> [out-folder]   (out-folder gets <file>.txt and <file>.red.txt to diff)
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { pdfTextAndName } from "../lib/pdfText.ts";
import mammoth from "mammoth";
import { extractPii, redact, piiGuard, locationFlag } from "../lib/pii.ts";

const [dir, outDir] = process.argv.slice(2);
if (!dir) { console.error("Usage: npm run dry-run -- <cv-folder> [out-folder]"); process.exit(1); }
if (outDir) mkdirSync(outDir, { recursive: true });
const clean = (t: string) => t.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

let bad = 0;
for (const f of readdirSync(dir).filter((f) => /\.(pdf|docx|txt)$/i.test(f)).sort()) {
  const buf = readFileSync(`${dir}/${f}`);
  let text: string, heading: string | null = null;
  if (/\.pdf$/i.test(f)) {
    const r = await pdfTextAndName(new Uint8Array(buf));
    text = clean(r.text);
    heading = r.heading;
  }
  else if (/\.docx$/i.test(f)) {
    text = clean((await mammoth.extractRawText({ buffer: buf })).value);
    heading = (await mammoth.convertToHtml({ buffer: buf })).value.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "") ?? null;
  } else text = clean(buf.toString("utf8"));
  const pii = extractPii(text, heading);
  const red = redact(text, pii);
  const g = piiGuard([red], pii);
  const redactions = (red.match(/\[REDACTED\]/g) ?? []).length;
  if (!g.ok) bad++;
  const fromFile = f.replace(/\.[a-z]+$/i, "").split("_").filter((x) => !/^(pm|spm|\d+)$/i.test(x)).join(" ").toLowerCase();
  const nameMatch = pii.name?.toLowerCase() === fromFile ? "name=file" : `name≠file(${fromFile})`;
  console.log([f.padEnd(30), String(text.length).padStart(5) + "ch", (pii.name ?? "NO NAME").padEnd(22), (pii.email ?? "no email").padEnd(34), `ph${pii.phone.length} url${pii.urls.length}${pii.address ? " addr" : ""}`, locationFlag(text).padEnd(10), `${redactions} redactions`, nameMatch, g.ok ? "ok" : `GUARD: ${g.reason}`].join(" | "));
  if (outDir) { writeFileSync(`${outDir}/${f}.txt`, text); writeFileSync(`${outDir}/${f}.red.txt`, red); }
}
console.log(bad ? `\n${bad} CV(s) would go to needs_review.` : "\nAll CVs pass the PII guard.");
