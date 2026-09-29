import "server-only";
import { z } from "zod";
import { generateJson } from "./gemini";
import type { Criterion, CriterionScore, Decision, Role } from "./types";

const ROLE_NAME: Record<Role, string> = { PM: "Product Manager", SPM: "Senior Product Manager" };

const GENERAL_ANCHORS = `General anchors for every criterion:
  0 = no evidence in the CV
  1 = claimed or implied only (skills list, summary adjectives, no instance)
  2 = one weak or indirect instance
  3 = one clear, concrete instance
  4 = multiple concrete instances, or one with a measurable outcome
  5 = repeated, concrete instances with measurable outcomes, at the level the role demands
Score only what is written in the CV. Titles, company brand, certifications, conference talks and summary adjectives are not evidence on their own.`;

const SOFT_GUARDRAILS = `GUARDRAILS for language-reading (pattern_soft) criteria:
- Score the substance of the claims, never grammar, fluency, vocabulary level, formatting, or CV design. Non-native English, typos and plain templates must not lower this score.
- Do not infer personality, gender, age, region or background from language.
- If the CV is too short or list-only to judge, score 2 (neutral), not 0.
- For this criterion, "evidence" must be 2-3 short phrases quoted exactly from the CV, separated by " | ".`;

const CONTEXT = `Context: Kargo is a Series A logistics SaaS company in Mumbai (freight forwarders, 3PLs, ports, carriers). Personal details in the CV have been replaced with [REDACTED]; ignore that token.`;

function criteriaBlock(criteria: Criterion[]) {
  return criteria
    .map(
      (c) =>
        `[${c.key}] ${c.name} (bucket: ${c.bucket}, weight ${c.weight}%)\n  Strong: ${c.strong_description}\n  Weak: ${c.weak_description}`,
    )
    .join("\n\n");
}

// ---------------- Scoring ----------------

const ScoreSchema = z.object({
  scores: z.array(
    z.object({
      criterion_key: z.string(),
      score: z.number().int().min(0).max(5),
      evidence: z.string().describe('A short phrase lifted verbatim from the CV that justifies the score, or "none found"'),
      reason: z.string().describe("One line"),
    }),
  ),
});

export async function scoreRole(cvRedacted: string, role: Role, criteria: Criterion[]): Promise<CriterionScore[]> {
  const hasSoft = criteria.some((c) => c.bucket === "pattern_soft");
  const prompt = `You are scoring a CV for the ${ROLE_NAME[role]} role. ${CONTEXT}

Score each criterion below from 0 to 5.

${GENERAL_ANCHORS}
${hasSoft ? `\n${SOFT_GUARDRAILS}\n` : ""}
Rules:
- Return exactly one entry per criterion key: ${criteria.map((c) => c.key).join(", ")}.
- "evidence" must be copied from the CV text, not paraphrased. If there is nothing, write "none found".
- A score above 2 requires evidence.
- Do NOT compute totals or weighted scores.

CRITERIA:
${criteriaBlock(criteria)}

CV:
"""
${cvRedacted}
"""`;
  const keys = new Set(criteria.map((c) => c.key));
  const out = await generateJson(prompt, ScoreSchema, (v) => {
    const got = new Set(v.scores.map((s) => s.criterion_key));
    const missing = [...keys].filter((k) => !got.has(k));
    const extra = [...got].filter((k) => !keys.has(k));
    if (missing.length || extra.length || v.scores.length !== keys.size)
      return `expected exactly keys ${[...keys].join(",")}; missing ${missing.join(",") || "-"}, unexpected ${extra.join(",") || "-"}`;
    return null;
  });
  return out.scores;
}

// ---------------- Brief + probes ----------------

function scoreLines(criteria: Criterion[], scores: CriterionScore[]) {
  const byKey = new Map(scores.map((s) => [s.criterion_key, s]));
  return criteria
    .map((c) => {
      const s = byKey.get(c.key);
      return `${c.key} ${c.name} (weight ${c.weight}): ${s?.score ?? 0}/5 — evidence: ${s?.evidence ?? "none found"} — ${s?.reason ?? ""}`;
    })
    .join("\n");
}

const BriefSchema = z.object({
  good_fit: z.array(z.string()).length(2).describe("Two lines: why this person is a good fit, citing the strongest criteria"),
  not_a_fit: z.array(z.string()).length(2).describe("Two lines: why they may not be, citing the weakest criteria / biggest risk"),
});

export async function writeBrief(cvRedacted: string, role: Role, criteria: Criterion[], scores: CriterionScore[]): Promise<string> {
  const prompt = `Write a 4-line fit brief for a founder deciding on this candidate for the ${ROLE_NAME[role]} role. ${CONTEXT}
Plain, specific language. Each line under 30 words. Cite criteria by their name only, never by code (write "Discovery with operational users", not "A4"). No filler.
Refer to the candidate only as "they" or "the candidate" — never he/she/his/her. Do not infer gender, age, region or background.

PER-CRITERION SCORES:
${scoreLines(criteria, scores)}

CV:
"""
${cvRedacted}
"""`;
  const b = await generateJson(prompt, BriefSchema);
  return [...b.good_fit.map((l) => `+ ${l}`), ...b.not_a_fit.map((l) => `− ${l}`)].join("\n");
}

const ProbesSchema = z.object({ probes: z.array(z.string()).length(3) });

export async function writeProbes(cvRedacted: string, role: Role, criteria: Criterion[], scores: CriterionScore[]): Promise<string[]> {
  const prompt = `Write 3 interview questions for this ${ROLE_NAME[role]} candidate. ${CONTEXT}
Each question must test one of the weakest or least-evidenced criteria below, reference something specific in the CV where possible, and ask for a concrete example (what happened, what they personally did, the outcome). Name the criterion key in brackets at the start, e.g. "[A3] ...". Address the candidate as "you".

PER-CRITERION SCORES:
${scoreLines(criteria, scores)}

CV:
"""
${cvRedacted}
"""`;
  return (await generateJson(prompt, ProbesSchema)).probes;
}

// ---------------- Email ----------------

const EmailSchema = z.object({ subject: z.string(), body: z.string() });
export const SIGNATURE = "Arjun Mehta\nFounder, Kargo";

export async function draftEmail(cvRedacted: string, role: Role, type: Decision, personalNote?: string | null): Promise<{ subject: string; body: string }> {
  const brief =
    type === "invite"
      ? `an INTERVIEW INVITE. Short and warm. Propose a 30-minute conversation and ask them to reply with 3 time slots that work for them in the next week.`
      : `a REJECTION. Warm, specific and respectful. Thank them for their time. No generic filler ("we received many strong applications"), no false promises ("we'll keep your CV on file", "future openings").`;
  const prompt = `Write ${brief}
The candidate applied for the ${ROLE_NAME[role]} role at Kargo (Series A logistics SaaS, Mumbai) by sending a CV. The email is from the founder, Arjun Mehta.
- There has been NO interview, call, meeting or conversation with them. Only their CV has been read.
- Reference ONE specific, real thing from their CV below (a project, result or experience) — do not invent anything.
- Address them with the literal placeholder [NAME] (e.g. "Hi [NAME],"). Never write any other name for them.
- Never write the token [REDACTED].
- Plain text, no markdown. Under 140 words.${personalNote ? `
- Arjun has written a personal note for this candidate. Include it in the email in his voice, keeping his meaning and key words; smooth the grammar only. Do not add promises he did not make. His note:
"""
${personalNote}
"""` : ""}
- End the body with exactly:
${SIGNATURE}

CV:
"""
${cvRedacted}
"""`;
  return generateJson(prompt, EmailSchema, (v) => {
    if (!v.body.includes("[NAME]")) return "body must contain [NAME]";
    if (/\[REDACTED\]/.test(v.subject + v.body)) return "must not contain [REDACTED]";
    if (!v.body.trim().endsWith("Founder, Kargo")) return `body must end with the signature "${SIGNATURE}"`;
    // Block claims that WE interviewed/spoke with them; "your user interviews" etc. is fine.
    if (type === "reject" && /\b(our|the|this|your) (interview|conversation|call|chat|meeting)s?\b(?! (with|of) (users|customers|operators))|\btime to (interview|speak|meet|chat)\b|\b(speaking|talking) (with|to) you\b|\b(meeting|met) you\b|\binterviewing you\b/i.test(v.body))
      return "rejection must not mention an interview, call or conversation: only the CV was reviewed";
    return null;
  });
}
