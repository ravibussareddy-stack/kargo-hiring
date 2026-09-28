import { handle } from "@/lib/http";
import { ingestCv } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    const role = form.get("role");
    if (!(file instanceof File)) throw new Error("No file.");
    if (role !== "PM" && role !== "SPM") throw new Error("Role must be PM or SPM.");
    return ingestCv(file.name, Buffer.from(await file.arrayBuffer()), role);
  });
}
