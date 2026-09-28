import { handle, type IdCtx } from "@/lib/http";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";

/** Saves Arjun's inline edit. Stored as typed (real name included); [NAME] is still filled at send time. */
export async function PATCH(req: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    const { subject, body } = await req.json();
    if (typeof subject !== "string" || typeof body !== "string" || !subject.trim() || !body.trim()) throw new Error("Subject and body are required.");
    const e = must(await db().from("emails").select("status").eq("candidate_id", id).single()) as { status: string };
    if (e.status === "sent") throw new Error("Already sent.");
    must(await db().from("emails").update({ subject, edited_body: body, status: "draft", last_error: null, updated_at: new Date().toISOString() }).eq("candidate_id", id));
  });
}
