import { handle, type IdCtx } from "@/lib/http";
import { changeAppliedRole } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    const { role } = await req.json();
    if (role !== "PM" && role !== "SPM") throw new Error("Role must be PM or SPM.");
    await changeAppliedRole(id, role);
  });
}
