// Quick self-check for the deterministic PII step: `npm run test:pii`
import { extractPii, redact, piiGuard, locationFlag } from "../lib/pii.ts";

const cvs: Record<string, string> = {
  pipeHeader: `PRIYA SHARMA
priya.sharma@example.com | +91 98200 12345 | linkedin.com/in/priyasharma | Andheri East, Mumbai
Flat 12, Sai Krupa CHS, MG Road, Andheri East, Mumbai 400069

EXPERIENCE
Product Manager, FreightCo (2021 - 2024)
- After finding that Priya's team... wait, Sharma Logistics was the client.
- Ran discovery with 14 CHA operators at JNPT; tickets down 30%.`,
  cvTitle: `Curriculum Vitae
Name: Arvind K. Menon
Email: arvind.menon@gmail.com   Phone: (022) 2345-6789 / 9876543210
https://github.com/arvindm  Location: Bengaluru, open to relocate
Worked 2016 - 2019 2020 at Menon & Sons.`,
  bulletNotAddress: `Farhan Qureshi
Email: fq@example.com   Phone: 99876 54321
Location: Pune

Senior Product Manager — Railyard, 2020 – present
- Owned the carrier integration platform end to end.
- Decided to stop building our own ERP connectors; I made the call, onboarding dropped from 6 weeks to 10 days.`,
  gluedPdf: `Strategy Leader
EDUCATION
IMT Ghaziabad
ROHAN MEHTARohan Mehta
squad_1@example.com+91 98202 1134598202 11345 rohan-mehtalinkedin.com/in/rohan-mehta`,
  noName: `product manager with 5 years experience
contact: someone@example.com`,
};

let failed = 0;
for (const [label, text] of Object.entries(cvs)) {
  const pii = extractPii(text);
  const red = redact(text, pii);
  const guard = piiGuard([red], pii);
  console.log(`\n=== ${label} ===`);
  console.log("pii:", JSON.stringify(pii));
  console.log("location:", locationFlag(text));
  console.log("guard:", JSON.stringify(guard));
  console.log(red);
  const expectOk = label !== "noName";
  if (label === "gluedPdf") {
    const withHint = extractPii(text, "ROHAN MEHTA");
    const r2 = redact(text, withHint);
    const g2 = piiGuard([r2], withHint);
    console.log("with heading hint:", JSON.stringify(g2), "\n" + r2);
    if (!g2.ok || /98202|11345|rohan|mehta|linkedin/i.test(r2)) { failed++; console.log("!! GLUED PDF TEXT LEAKED"); }
    if (pii.name !== "Rohan Mehta" || withHint.name !== "Rohan Mehta") { failed++; console.log("!! DOUBLED NAME NOT COLLAPSED:", pii.name, withHint.name); }
  }
  if (guard.ok !== expectOk) { failed++; console.log("!! UNEXPECTED GUARD RESULT"); }
  // Over-redaction check: work content must survive.
  if (label === "bulletNotAddress" && !red.includes("Decided to stop building")) { failed++; console.log("!! BULLET WAS REDACTED AS AN ADDRESS"); }
  if (label === "pipeHeader" && (red.includes("Sai Krupa") || !red.includes("Ran discovery"))) { failed++; console.log("!! ADDRESS HANDLING WRONG"); }
}
console.log(failed ? `\n${failed} FAILED` : "\nAll PII checks passed.");
process.exit(failed ? 1 : 0);
