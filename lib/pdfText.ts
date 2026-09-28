// PDF text + header-name candidates. No server-only import so scripts can reuse it.
import { extractText, getDocumentProxy } from "unpdf";
import { looksLikeName } from "./pii.ts";

export async function pdfTextAndName(buf: Uint8Array): Promise<{ text: string; heading: string | null }> {
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return { text, heading: await pdfHeaderName(pdf) };
}

/**
 * "Largest header text" heuristic, position-aware: among name-like text runs in the
 * top 30% of page 1, prefer bigger font, a run stamped twice at the same spot, and higher up.
 */
async function pdfHeaderName(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string | null> {
  const page = await pdf.getPage(1);
  const height = page.getViewport({ scale: 1 }).height;
  const items = ((await page.getTextContent()).items as { str?: string; transform: number[] }[])
    .map((i) => ({ s: (i.str ?? "").replace(/\s+/g, " ").trim(), size: Math.hypot(i.transform[2], i.transform[3]), y: height - i.transform[5] }))
    .filter((i) => i.s && i.y < height * 0.3);
  const scored = items
    .filter((i) => looksLikeName(i.s))
    .map((i) => {
      const twin = items.some((o) => o !== i && o.s.toLowerCase() === i.s.toLowerCase() && Math.abs(o.y - i.y) < 2);
      return { s: i.s, score: i.size + (twin ? 6 : 0) - i.y / 40 };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.s ?? null;
}
