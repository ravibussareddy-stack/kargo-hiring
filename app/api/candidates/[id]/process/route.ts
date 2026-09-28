import { handle, type IdCtx } from "@/lib/http";
import { processCandidate } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(() => processCandidate(id));
}
