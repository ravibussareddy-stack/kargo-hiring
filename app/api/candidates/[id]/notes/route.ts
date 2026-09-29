import { handle, type IdCtx } from "@/lib/http";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

/** Adds an internal team note. Notes are never sent to candidates or to the AI. */
export async function POST(req: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    const { author, body } = await req.json();
    const a = typeof author === "string" ? author.trim().slice(0, 60) : "";
    const b = typeof body === "string" ? body.trim() : "";
    if (!a) throw new Error("Add your name so the team knows who wrote this.");
    if (!b || b.length > 4000) throw new Error("Note must be 1–4000 characters.");
    const res = await db().from("candidate_notes").insert({ candidate_id: id, author: a, body: b }).select("id").single();
    if (res.error) throw new Error(/candidate_notes/.test(res.error.message) ? "Run supabase/migrations/003_notes.sql first." : res.error.message);
    return res.data;
  });
}
