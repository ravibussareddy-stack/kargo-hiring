import type { Criterion, CriterionScore, Totals } from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function weightSum(criteria: Pick<Criterion, "weight">[]): number {
  return round1(criteria.reduce((s, c) => s + Number(c.weight), 0));
}

/** total = Σ (score/5)·weight, plus bucket subtotals. Computed here, never by the model. */
export function computeTotals(criteria: Criterion[], scores: CriterionScore[]): Totals {
  const byKey = new Map(scores.map((s) => [s.criterion_key, s.score]));
  const t = { requirements: 0, pattern_hard: 0, pattern_soft: 0, trust: 0 };
  for (const c of criteria) {
    t[c.bucket] += ((byKey.get(c.key) ?? 0) / 5) * Number(c.weight);
  }
  return {
    total: round1(t.requirements + t.pattern_hard + t.pattern_soft + t.trust),
    requirements_subtotal: round1(t.requirements),
    pattern_hard_subtotal: round1(t.pattern_hard),
    pattern_soft_subtotal: round1(t.pattern_soft),
    trust_subtotal: round1(t.trust),
  };
}

/** Code-side sanity rules applied to model output. */
export function sanitizeScores(scores: CriterionScore[]): CriterionScore[] {
  return scores.map((s) => {
    const noEvidence = !s.evidence.trim() || /^none found\.?$/i.test(s.evidence.trim());
    if (s.score > 2 && noEvidence) {
      return { ...s, score: 0, evidence: "none found", reason: `[forced to 0: score ${s.score} given without evidence] ${s.reason}` };
    }
    return s;
  });
}
