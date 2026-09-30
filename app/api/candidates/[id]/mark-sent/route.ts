import { handle, type IdCtx } from "@/lib/http";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";

/** For emails Arjun sent himself (outside the app): record them as sent so the pipeline stays accurate. */
export async function POST(_: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    const c = must(await db().from("candidates").select("status").eq("id", id).single()) as { status: string };
    if (c.status === "sent") throw new Error("Already marked as sent.");
    const now = new Date().toISOString();
    must(await db().from("emails").update({ status: "sent", last_error: null, updated_at: now }).eq("candidate_id", id));
    must(await db().from("candidates").update({ status: "sent", sent_at: now, resend_message_id: "manual" }).eq("id", id));
  });
}
