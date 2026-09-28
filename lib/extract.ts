import "server-only";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export interface Extracted {
  text: string;
  /** Top heading text, when the format exposes it (.docx h1 / Title style). */
  heading: string | null;
}

export async function extractCvText(fileName: string, buf: Buffer): Promise<Extracted> {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "docx") {
    const [{ value: text }, { value: html }] = await Promise.all([
      mammoth.extractRawText({ buffer: buf }),
      mammoth.convertToHtml({ buffer: buf }),
    ]);
    const h = html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1] ?? html.match(/<h2[^>]*>(.*?)<\/h2>/i)?.[1] ?? null;
    return { text: clean(text), heading: h ? h.replace(/<[^>]+>/g, "").trim() : null };
  }
  if (ext === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: clean(text), heading: null };
  }
  if (ext === "txt" || ext === "md") return { text: clean(buf.toString("utf8")), heading: null };
  throw new Error(`Unsupported file type ".${ext}". Use .pdf, .docx or .txt.`);
}

function clean(t: string) {
  return t.replace(/\r\n?/g, "\n").replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
