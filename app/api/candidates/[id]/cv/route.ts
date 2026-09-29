import { NextResponse } from "next/server";
import type { IdCtx } from "@/lib/http";
import { db } from "@/lib/supabase";
import { CONTENT_TYPES, getOriginal } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Serves the candidate's CV behind the dashboard login.
 * ?format=text returns the extracted text (always available); otherwise the original file.
 * ?download=1 forces a download instead of showing it in the browser.
 */
export async function GET(req: Request, { params }: IdCtx) {
  const { id } = await params;
  const url = new URL(req.url);
  const { data: c } = await db().from("candidates").select("file_name, raw_text").eq("id", id).single();
  if (!c) return new NextResponse("Not found", { status: 404 });
  const safeName = (c.file_name as string).replace(/[^\w.\- ]/g, "_");
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

  if (url.searchParams.get("format") !== "text") {
    const original = await getOriginal(id);
    if (original) {
      return new NextResponse(original.body, {
        headers: {
          ...headers,
          "Content-Type": CONTENT_TYPES[original.ext] ?? "application/octet-stream",
          "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${safeName}"`,
        },
      });
    }
  }
  return new NextResponse(c.raw_text ?? "", { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}
