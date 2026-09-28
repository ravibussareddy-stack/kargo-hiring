import { handle } from "@/lib/http";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  return handle(async () => {
    const { invite_cutoff } = await req.json();
    const n = Number(invite_cutoff);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error("Cut-off must be a whole number 0-100.");
    must(await db().from("settings").upsert({ id: 1, invite_cutoff: n }));
  });
}
