import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

let ai: GoogleGenAI | null = null;
function client() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

/**
 * One structured-JSON Gemini call, validated with zod. Retries once on
 * invalid output. `extraCheck` can reject semantically wrong output.
 * Callers MUST run piiGuard over any CV-derived text before calling this.
 */
export async function generateJson<S extends z.ZodType>(
  prompt: string,
  schema: S,
  extraCheck?: (v: z.infer<S>) => string | null,
): Promise<z.infer<S>> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client().models.generateContent({
      model,
      contents: attempt === 0 ? prompt : `${prompt}\n\nYour previous answer was invalid (${lastErr}). Return ONLY valid JSON matching the schema.`,
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
      },
    });
    try {
      const parsed = schema.safeParse(JSON.parse(res.text ?? ""));
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      const problem = extraCheck?.(parsed.data);
      if (problem) throw new Error(problem);
      return parsed.data;
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 300) : String(e);
    }
  }
  throw new Error(`Model output invalid after retry: ${lastErr}`);
}
