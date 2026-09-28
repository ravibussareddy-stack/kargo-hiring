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

export type Settings = { invite_cutoff: number; min_invite_score: number; min_score_migrated: boolean };

export async function getSettings(): Promise<Settings> {
  await ensureSeeded();
  // select("*") so a DB without the min_invite_score column (migration 002) still works, using 50.
  const row = must(await db().from("settings").select("*").eq("id", 1).single()) as { invite_cutoff: number; min_invite_score?: number };
  return {
    invite_cutoff: row.invite_cutoff,
    min_invite_score: row.min_invite_score === undefined ? 50 : Number(row.min_invite_score),
    min_score_migrated: row.min_invite_score !== undefined,
  };
}
