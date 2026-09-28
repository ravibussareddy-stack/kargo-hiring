import { handle } from "@/lib/http";
import { recompute } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  return handle(() => recompute());
}
