import { handle } from "@/lib/http";
import { db, must } from "@/lib/supabase";
import { loadCriteria } from "@/lib/rubric";
import { weightSum } from "@/lib/rubricMath";
import { ROLES } from "@/lib/types";

export const runtime = "nodejs";

type Edit = { id: string; name: string; weight: number; strong_description: string; weak_description: string };

export async function PUT(req: Request) {
  return handle(async () => {
    const { criteria } = (await req.json()) as { criteria: Edit[] };
    const current = await loadCriteria();
    const edits = new Map(criteria.map((c) => [c.id, c]));
    const merged = current.map((c) => ({ ...c, ...(edits.get(c.id) ?? {}), weight: Number(edits.get(c.id)?.weight ?? c.weight) }));
    for (const role of ROLES) {
      const sum = weightSum(merged.filter((c) => c.role === role));
      if (sum !== 100) throw new Error(`${role} weights sum to ${sum}, must be 100. Nothing saved.`);
    }
    for (const c of merged) {
      if (!edits.has(c.id)) continue;
      if (!(c.weight >= 0) || !c.name.trim() || !c.strong_description.trim() || !c.weak_description.trim()) throw new Error(`Invalid values for ${c.role} ${c.key}.`);
    }
    for (const c of merged.filter((c) => edits.has(c.id))) {
      must(await db().from("rubric_criteria").update({ name: c.name, weight: c.weight, strong_description: c.strong_description, weak_description: c.weak_description }).eq("id", c.id));
    }
    return { ok: true, note: "Saved. Existing scores are unchanged; re-score candidates to apply." };
  });
}
