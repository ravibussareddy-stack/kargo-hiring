import { handle, type IdCtx } from "@/lib/http";
import { setDecision } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    const { decision } = await req.json();
    if (decision !== "invite" && decision !== "reject") throw new Error("Bad decision.");
    await setDecision(id, decision);
  });
}
