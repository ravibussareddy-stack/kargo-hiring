import { handle, type IdCtx } from "@/lib/http";
import { sendCandidateEmail } from "@/lib/send";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(() => sendCandidateEmail(id));
}
