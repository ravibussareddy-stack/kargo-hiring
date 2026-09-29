import { handle, type IdCtx } from "@/lib/http";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    must(await db().from("candidate_notes").delete().eq("id", id));
  });
}
