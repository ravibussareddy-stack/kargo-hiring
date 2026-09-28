import type { Bucket, Role } from "./types";

type SeedRow = {
  role: Role;
  bucket: Bucket;
  key: string;
  name: string;
  strong_description: string;
  weak_description: string;
  weight: number;
};

// ---------- Bucket B + C: shared text (SPM adds a higher bar where noted) ----------

const B1 = {
  bucket: "pattern_hard" as const,
  key: "B1",
  name: "Worked inside the operation",
  strong_description:
    "Has personally done ground-level operations work — handled Bills of Lading, customs clearance, shipment documentation, carrier allocation, berth/DO escalations, exception management — not just built software for people who do. Calibration: every Exceeds hire has this (CHA operations at JNPT; 200+ shipments/month documentation; port services at JNPT; freight forwarder documentation desk; carrier allocation at a 3PL). Integrating with 3PLs via API only scores 1, not 3+.",
  weak_description:
    "Domain knowledge acquired only from a desk, a dashboard or a client call.",
  weight: 7,
};

const B2_STRONG =
  "Noticed a problem nobody asked them to solve, built a quick fix themselves (Excel tracker, weekend prototype, checklist, dashboard, new workflow) and colleagues adopted it voluntarily, with adoption stated. Calibration: an Excel tracker adopted by the 12-person ops team in two weeks and a weekend BoL prototype used by 30 colleagues in a month; redesigning the documentation workflow over a weekend when the FMS vendor changed format; an Excel dashboard adopted by two other regional teams; an onboarding checklist becoming the team standard.";
const B2_WEAK =
  "Improvements that were their assigned job (e.g. a marketer running a case study programme), or process artefacts built for their own function without evidence of pull from others.";

const B3 = {
  bucket: "pattern_soft" as const,
  key: "B3",
  name: "Problem-first, first-hand language",
  strong_description:
    "Reads HOW the candidate describes their work, not what the work was. Quote 2-3 short phrases from the CV as evidence. Strong: bullets start from a problem they noticed (\"after finding that...\", \"when X changed without notice...\", \"identified...\"), describe what they personally did in plain operational terms, name the people or teams who were affected, and are candid about what went wrong. Self-description, if any, is a belief about work rather than a list of traits. Calibration: building a tracker \"after finding\" the team had no way to see shipment status; a profile stating a belief that customers should not have to manage the company's mistakes; naming the root cause of a lost deal plainly; \"ship fast, kill what doesn't work, document why\".",
  weak_description:
    "Language built on credentials, frameworks and labels — certification and membership lists, methodology names (JTBD, OKRs, Agile), speaker slots, taglines like \"Growth Leader · Team Builder\", or summaries made of adjectives (\"strong in\", \"track record of\", \"passionate\"). Calibration: a summary followed by a certifications line; a tagline header.",
  weight: 6,
};

const C1_STRONG =
  "Stays with a problem through to resolution without escalating it, and is open about failure — writes the post-mortem, documents why a deal was lost, kills their own feature, fixes the mess before the customer feels it. Calibration: a post-mortem on a lost 4-month deal that became team practice; killing 2 of their own features on usage data and owning the outage post-mortem to closure; resolving a customs hold overnight and 14 months without an escalation to management; inspections closed without penalty.";
const C1_WEAK =
  "CV lists only successes, never a miss; ownership stated as a trait, not shown.";

export const RUBRIC_SEED: SeedRow[] = [
  // ---------------- PM ----------------
  {
    role: "PM", bucket: "requirements", key: "A1", name: "PM ownership", weight: 15,
    strong_description: "2-4 years in PM roles owning a feature or product area end to end (spec -> ship -> post-launch tracking).",
    weak_description: "APM/support roles only, or ownership always shared with a senior PM making the calls.",
  },
  {
    role: "PM", bucket: "requirements", key: "A2", name: "Building from zero without structure", weight: 15,
    strong_description: "Built something that did not exist before (first process, first template, first product area, first API docs) at a company where no playbook existed.",
    weak_description: "Worked inside an established PM org, improved existing systems only.",
  },
  {
    role: "PM", bucket: "requirements", key: "A3", name: "Shipped and killed", weight: 15,
    strong_description: "Named features shipped AND at least one thing stopped/killed or pivoted based on usage data, with what was learned.",
    weak_description: "Only a list of features shipped, no evidence of cutting anything.",
  },
  {
    role: "PM", bucket: "requirements", key: "A4", name: "Discovery with operational users", weight: 15,
    strong_description: "Ran discovery directly with end users doing operational work and changed what was built as a result, with an outcome (tickets down, adoption up).",
    weak_description: "Discovery mentioned generically or only through stakeholders.",
  },
  {
    role: "PM", bucket: "requirements", key: "A5", name: "Logistics / ops-heavy domain exposure", weight: 10,
    strong_description: "Built product for, sold to, or served freight forwarders, 3PLs, ports, carriers or supply chain operators.",
    weak_description: "No ops-heavy domain.",
  },
  { role: "PM", ...B1 },
  { role: "PM", bucket: "pattern_hard", key: "B2", name: "Spotted an unassigned problem, fixed it fast, peers adopted it", weight: 7, strong_description: B2_STRONG, weak_description: B2_WEAK },
  { role: "PM", ...B3 },
  { role: "PM", bucket: "trust", key: "C1", name: "Owns the outcome, including when it goes wrong", weight: 10, strong_description: C1_STRONG, weak_description: C1_WEAK },

  // ---------------- SPM ----------------
  {
    role: "SPM", bucket: "requirements", key: "A1", name: "Senior PM ownership", weight: 15,
    strong_description: "5-8 years in PM with clear ownership of a product area and no senior PM layer above making the calls.",
    weak_description: "Under 5 years of PM, or always one of many PMs under a head of product.",
  },
  {
    role: "SPM", bucket: "requirements", key: "A2", name: "Platform / integration / data layer", weight: 20,
    strong_description: "Owned or deeply built integrations, APIs, data pipelines, carrier/ERP/TMS connections, or products embedded in complex existing technical environments, with reliability or data-quality outcomes.",
    weak_description: "Front-end features or UX work only.",
  },
  {
    role: "SPM", bucket: "requirements", key: "A3", name: "Hard calls under ambiguity", weight: 15,
    strong_description: "Made a consequential decision (build vs configure vs don't build, vendor migration, killing a direction) without committee approval and states the outcome.",
    weak_description: "Executed decisions made by others.",
  },
  {
    role: "SPM", bucket: "requirements", key: "A4", name: "Early-stage / rules not written yet", weight: 10,
    strong_description: "Worked at an early-stage company or built practices, frameworks or a function others now run on.",
    weak_description: "Large or mature organisations only.",
  },
  {
    role: "SPM", bucket: "requirements", key: "A5", name: "Ops-heavy domain exposure", weight: 10,
    strong_description: "Built product for, sold to, or served freight forwarders, 3PLs, ports, carriers or supply chain operators — with product-level depth in the domain, not just adjacency (higher bar than PM).",
    weak_description: "No ops-heavy domain, or only adjacency (e.g. a single integration or client in the space).",
  },
  { role: "SPM", ...B1 },
  {
    role: "SPM", bucket: "pattern_hard", key: "B2", name: "Spotted an unassigned problem, fixed it fast, peers adopted it", weight: 7,
    strong_description: B2_STRONG + " SPM bar: the fix should have become part of the product or the company's standard way of working, not just a team tool.",
    weak_description: B2_WEAK + " For SPM, a fix that stayed a team tool scores no higher than 3.",
  },
  { role: "SPM", ...B3 },
  {
    role: "SPM", bucket: "trust", key: "C1", name: "Owns the outcome, including when it goes wrong", weight: 10,
    strong_description: C1_STRONG + " SPM bar: the consequences owned were at company or customer-account level, not only personal tasks.",
    weak_description: C1_WEAK + " For SPM, ownership of personal tasks only scores no higher than 3.",
  },
];
