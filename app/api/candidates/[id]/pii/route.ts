import { handle, type IdCtx } from "@/lib/http";
import { fixPii } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    const { name, email, phone } = await req.json();
    const split = (s: unknown) => (typeof s === "string" ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);
    return fixPii(id, { name: name?.trim() || null, email: email?.trim() || null, phone: split(phone) });
  });
}
