import { handle } from "@/lib/http";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  return handle(async () => {
    const { invite_cutoff, min_invite_score } = await req.json();
    const n = Number(invite_cutoff);
    const m = Number(min_invite_score);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error("Cut-off must be a whole number 0-100.");
    if (!(m >= 0 && m <= 100)) throw new Error("Minimum score must be 0-100.");
    const res = await db().from("settings").upsert({ id: 1, invite_cutoff: n, min_invite_score: m });
    if (res.error && /min_invite_score/.test(res.error.message))
      throw new Error("Run supabase/migrations/002_min_invite_score.sql in the Supabase SQL editor first.");
    must(res);
  });
}
