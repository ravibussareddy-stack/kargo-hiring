import { handle, type IdCtx } from "@/lib/http";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";

const STAGES = { invited: "Invited", wip: "In progress", dropped: "Dropped off" } as const;
type Stage = keyof typeof STAGES;

/** Moves an invited candidate between interview stages and logs the move as a team note. */
export async function POST(req: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    const { stage, reason, author } = (await req.json()) as { stage: Stage; reason?: string; author?: string };
    if (!(stage in STAGES)) throw new Error("Unknown stage.");
    const c = must(await db().from("candidates").select("decision").eq("id", id).single()) as { decision: string | null };
    if (c.decision !== "invite") throw new Error("Only invited candidates can be tracked here.");
    const dropReason = stage === "dropped" ? (reason ?? "").trim().slice(0, 300) || "No reason given" : null;
    const res = await db().from("candidates").update({ interview_stage: stage, interview_stage_at: new Date().toISOString(), drop_reason: dropReason }).eq("id", id);
    if (res.error) throw new Error(/interview_stage|drop_reason/.test(res.error.message) ? "Run supabase/migrations/005_interview_stage.sql first." : res.error.message);
    // History for the team: best effort, never blocks the move.
    const who = (author ?? "").trim().slice(0, 60) || "Someone";
    await db().from("candidate_notes").insert({ candidate_id: id, author: who, body: `Moved to ${STAGES[stage]}${dropReason ? ` (${dropReason})` : ""}.` });
  });
}
