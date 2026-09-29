// Stores original CV files for candidates uploaded before originals were kept.
// Usage: npm run backfill-originals -- <folder-with-the-cv-files>   (matched by file name)
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const dir = process.argv[2];
if (!dir) { console.error("Usage: npm run backfill-originals -- <folder>"); process.exit(1); }
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TYPES: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain; charset=utf-8" };

const { data: bucket } = await s.storage.getBucket("cvs");
if (!bucket) {
  const { error } = await s.storage.createBucket("cvs", { public: false, fileSizeLimit: "10MB" });
  if (error) throw error;
  console.log("Created private bucket 'cvs'");
}
const { data: cands, error } = await s.from("candidates").select("id, file_name");
if (error) throw error;
const files = new Set(readdirSync(dir));
let ok = 0, missing = 0;
for (const c of cands!) {
  if (!files.has(c.file_name)) { missing++; continue; }
  const ext = c.file_name.toLowerCase().split(".").pop()!;
  const { error: e } = await s.storage.from("cvs").upload(`${c.id}/original.${ext}`, readFileSync(`${dir}/${c.file_name}`), { contentType: TYPES[ext] ?? "application/octet-stream", upsert: true });
  if (e) console.log("fail", c.file_name, e.message); else ok++;
}
console.log(`Stored ${ok} originals · ${missing} candidates had no matching file in the folder`);
