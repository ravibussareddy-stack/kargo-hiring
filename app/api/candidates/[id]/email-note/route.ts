import { handle, type IdCtx } from "@/lib/http";
import { setPersonalNote } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Saves Arjun's personal line for the email and redrafts around it. Empty note = remove it. */
export async function PUT(req: Request, { params }: IdCtx) {
  const { id } = await params;
  return handle(async () => {
    const { note } = await req.json();
    if (note != null && (typeof note !== "string" || note.length > 1000)) throw new Error("Keep the note under 1000 characters.");
    await setPersonalNote(id, note || null);
  });
}
