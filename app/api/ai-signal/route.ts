import { handle } from "@/lib/http";
import { backfillAiSignals } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Computes the AI-writing signal for candidates missing one. Call repeatedly until remaining = 0. */
export async function POST() {
  return handle(() => backfillAiSignals());
}
