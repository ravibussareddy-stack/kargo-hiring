import "server-only";
import { db, must } from "./supabase";
import { RUBRIC_SEED } from "./rubricSeed";
import { weightSum } from "./rubricMath";
import type { Criterion, Role } from "./types";

/** Seeds rubric_criteria and settings on first run. Safe to call repeatedly. */
export async function ensureSeeded() {
  const { count, error } = await db().from("rubric_criteria").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  if (!count) {
    const rows = RUBRIC_SEED.map((r, i) => ({ ...r, sort_order: i }));
    must(await db().from("rubric_criteria").upsert(rows, { onConflict: "role,key", ignoreDuplicates: true }));
  }
  must(await db().from("settings").upsert({ id: 1 }, { onConflict: "id", ignoreDuplicates: true }));
}

export async function loadCriteria(role?: Role): Promise<Criterion[]> {
  await ensureSeeded();
  let q = db().from("rubric_criteria").select("*").order("sort_order");
  if (role) q = q.eq("role", role);
  const rows = must(await q) as Criterion[];
  return rows.map((r) => ({ ...r, weight: Number(r.weight) }));
}

/** Loads a role's criteria and refuses to continue if weights don't sum to 100. */
export async function loadValidatedCriteria(role: Role): Promise<Criterion[]> {
  const criteria = await loadCriteria(role);
  const sum = weightSum(criteria);
  if (criteria.length === 0) throw new Error(`No rubric criteria for ${role}.`);
  if (sum !== 100) throw new Error(`${role} rubric weights sum to ${sum}, not 100. Fix them on /rubric before scoring.`);
  return criteria;
}

export async function getCutoff(): Promise<number> {
  await ensureSeeded();
  const row = must(await db().from("settings").select("invite_cutoff").eq("id", 1).single()) as { invite_cutoff: number };
  return row.invite_cutoff;
}
