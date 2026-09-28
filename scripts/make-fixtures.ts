// Writes 3 fictional test CVs to fixtures/ with emails at your test domain.
// Usage: npm run fixtures -- <test-domain>   e.g. npm run fixtures -- example.org
import { mkdirSync, writeFileSync } from "node:fs";

const domain = process.argv[2];
if (!domain) { console.error("Usage: npm run fixtures -- <test-domain>"); process.exit(1); }
const dir = new URL("../fixtures/", import.meta.url);
mkdirSync(dir, { recursive: true });

const cvs: Record<string, string> = {
  "test-kavya-pillai-PM.txt": `KAVYA PILLAI
kavya.pillai.test@${domain} | +91 98111 22334 | linkedin.com/in/kavyapillai-test
Thane, Maharashtra

EXPERIENCE
Product Manager — ShipLedger (freight forwarding SaaS, 25 people), 2022 – present
- First PM at the company; wrote the first PRD template and release checklist the team still uses.
- After finding that documentation executives re-keyed every Bill of Lading into two systems, sat with 9 of them at a forwarder in Nhava Sheva for a week and rebuilt the BoL intake flow; re-keying tickets fell 40% in two months.
- Shipped carrier rate import and a customs status tracker. Killed our WhatsApp notification feature after 6 weeks when usage data showed 4% open rates; wrote up why and moved the effort to email digests.
- When a release broke invoice PDFs for our largest client, stayed on it overnight, shipped the fix before their morning cut-off and wrote the post-mortem.

Operations Executive — Oceanic Logistics (freight forwarder), 2019 – 2022
- Ran the documentation desk: 150+ shipments/month of BLs, shipping bills and DO follow-ups at JNPT.
- Built an Excel exception tracker on my own after we missed two DO deadlines; the 10-person desk adopted it within a month and it became the team standard.

EDUCATION
B.Com, University of Mumbai`,

  "test-farhan-qureshi-SPM.txt": `Farhan Qureshi
Email: farhan.qureshi.test@${domain}   Phone: 99876 54321
Location: Pune (open to relocate to Mumbai)

Senior Product Manager — Railyard (Series B TMS platform), 2020 – present
- Owned the carrier integration platform end to end; no product layer above me. Took EDI/API carrier connections from 12 to 140 and cut failed tracking events from 9% to 1.5%.
- Decided to stop building our own ERP connectors and move to a configurable integration layer; the build team disagreed, I made the call, onboarding time for new ERP customers dropped from 6 weeks to 10 days.
- Wrote the integration reliability playbook that the support and solutions teams now run on.
- Lost a 3PL account after a data sync outage; ran the account-level post-mortem with the customer and we won them back two quarters later.

Product Manager — FinGrid (payments), 2016 – 2020
- Built reconciliation data pipelines for bank feeds.

Skills: SQL, APIs, EDI, stakeholder management`,

  "test-rahul-verma-PM.txt": `RAHUL VERMA
Growth Leader · Product Visionary · Team Builder
rahul.verma.test@${domain} | +91 90000 11223 | Bengaluru

SUMMARY
Passionate, results-driven product professional with a strong track record of driving growth. Strong in OKRs, JTBD, Agile and Design Thinking.

EXPERIENCE
Product Manager — MegaRetail (10,000+ employees), 2021 – present
- Part of a 30-PM product org under the Head of Product.
- Drove engagement initiatives across the mobile app.
- Launched loyalty programme features.

CERTIFICATIONS
CSPO, Pragmatic Marketing, Google PM Certificate
Speaker at ProductCon 2023`,
};

for (const [name, text] of Object.entries(cvs)) writeFileSync(new URL(name, dir), text);
console.log(`Wrote ${Object.keys(cvs).length} CVs to fixtures/ with emails @${domain}`);
