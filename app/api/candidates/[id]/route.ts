import { handle, type IdCtx } from "@/lib/http";
import { db, must } from "@/lib/supabase";
import { removeOriginal } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    must(await db().from("candidates").delete().eq("id", id));
    await removeOriginal(id).catch(() => {});
  });
}
