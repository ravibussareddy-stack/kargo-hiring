// Verifies every external service before you deploy. Usage: npm run check
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { Resend } from "resend";
import { RUBRIC_SEED } from "../lib/rubricSeed.ts";

const env = process.env;
let failures = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => { failures++; console.log(`  ✗ ${m}`); };
const warn = (m: string) => console.log(`  ! ${m}`);

console.log("\nEnvironment");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "RESEND_FROM_ADDRESS", "DASHBOARD_PASSWORD"]) {
  env[k] ? ok(k) : bad(`${k} is empty`);
}
env.RESEND_API_KEY ? ok("RESEND_API_KEY") : warn("RESEND_API_KEY empty — Send button will show 'Email not configured'");

console.log("\nRubric seed");
for (const role of ["PM", "SPM"]) {
  const rows = RUBRIC_SEED.filter((r) => r.role === role);
  const sum = rows.reduce((s, r) => s + r.weight, 0);
  sum === 100 ? ok(`${role}: ${rows.length} criteria, weights = 100`) : bad(`${role} weights = ${sum}`);
}

if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.log("\nSupabase");
  const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  let tablesOk = true;
  for (const t of ["rubric_criteria", "candidates", "scores", "role_results", "emails", "settings"]) {
    const { error, count } = await svc.from(t).select("*", { count: "exact", head: true });
    if (error || count === null) { tablesOk = false; bad(`table ${t}: ${error?.message || "missing"}`); } else ok(`table ${t} (${count} rows)`);
  }
  if (!tablesOk) warn("Run the schema: npm run db:migrate, or paste supabase/schema.sql into the SQL editor.");
  else {
    const { data: rc } = await svc.from("rubric_criteria").select("role, weight");
    if (!rc?.length) warn("rubric_criteria is empty — it is seeded on the first page load.");
    else for (const role of ["PM", "SPM"]) {
      const sum = rc.filter((r) => r.role === role).reduce((s, r) => s + Number(r.weight), 0);
      sum === 100 ? ok(`DB ${role} weights = 100`) : bad(`DB ${role} weights = ${sum}`);
    }
    // RLS: insert a probe row with the service key, confirm the anon key cannot see it.
    const { data: probe, error: insErr } = await svc.from("candidates")
      .insert({ applied_role: "PM", file_name: "__rls_probe__", pii: { name: "RLS Probe" }, status: "needs_review" }).select("id").single();
    if (insErr) bad(`RLS probe insert: ${insErr.message}`);
    else {
      const { data: leaked } = await anon.from("candidates").select("pii").eq("id", probe.id);
      leaked?.length ? bad("anon key CAN read candidates.pii — enable RLS!") : ok("anon key cannot read pii (RLS on)");
      await svc.from("candidates").delete().eq("id", probe.id);
    }
  }
}

if (env.GEMINI_API_KEY) {
  console.log("\nGemini");
  const keys = [env.GEMINI_API_KEY, ...(env.GEMINI_API_KEYS_BACKUP ?? "").split(",")].map((k) => k?.trim()).filter(Boolean) as string[];
  for (const [i, key] of keys.entries()) try {
    const ai = new GoogleGenAI({ apiKey: key });
    const r = await ai.models.generateContent({
      model: env.GEMINI_MODEL || "gemini-3.8-flash",
      contents: 'Return {"ok": true}',
      config: { temperature: 0, responseMimeType: "application/json" },
    });
    JSON.parse(r.text ?? "").ok ? ok(`key #${i + 1}: ${env.GEMINI_MODEL} responds with JSON`) : bad(`key #${i + 1}: unexpected reply: ${r.text}`);
  } catch (e) { bad(`key #${i + 1}: ${(e as Error).message.slice(0, 200)}`); }
}

if (env.RESEND_API_KEY) {
  console.log("\nResend");
  const from = env.RESEND_FROM_ADDRESS ?? "";
  const fromDomain = from.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
  const { data, error } = await new Resend(env.RESEND_API_KEY).domains.list();
  if (error) {
    /restrict/i.test(error.message) ? ok("key valid (sending-only key; can't list domains)") : bad(`Resend: ${error.message}`);
  } else {
    ok("key valid");
    const verified = (data?.data ?? []).filter((d) => d.status === "verified").map((d) => d.name);
    if (fromDomain === "resend.dev") warn("Sender is resend.dev: Resend only delivers to YOUR Resend account's email. Verify a domain to send to the MESA test address.");
    else if (fromDomain && !verified.includes(fromDomain)) bad(`sender domain ${fromDomain} is not verified in Resend (verified: ${verified.join(", ") || "none"})`);
    else ok(`sender domain ${fromDomain} verified`);
  }
  console.log(`  allowed recipients: ${env.ALLOWED_RECIPIENTS || "-"} | allowed domains: ${env.ALLOWED_RECIPIENT_DOMAINS || "-"}`);
  if (!env.ALLOWED_RECIPIENTS && !env.ALLOWED_RECIPIENT_DOMAINS) warn("No allowlist set — every send is blocked.");
}

console.log(failures ? `\n${failures} problem(s).` : "\nAll good.");
process.exit(failures ? 1 : 0);
