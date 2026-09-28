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
  if (guard.ok !== expectOk) { failed++; console.log("!! UNEXPECTED GUARD RESULT"); }
}
process.exit(failed ? 1 : 0);
