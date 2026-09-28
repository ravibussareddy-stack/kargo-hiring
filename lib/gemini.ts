import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

/** Primary key first, then GEMINI_API_KEYS_BACKUP (comma-separated). */
function apiKeys(): string[] {
  const keys = [process.env.GEMINI_API_KEY, ...(process.env.GEMINI_API_KEYS_BACKUP ?? "").split(",")]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k));
  if (!keys.length) throw new Error("GEMINI_API_KEY is not set.");
  return [...new Set(keys)];
}

const clients = new Map<string, GoogleGenAI>();
let preferred = 0; // index of the last key that worked; sticky within a warm instance

// Quota, rate-limit, bad key, or temporary overload: worth trying the next key.
function isRetryable(e: unknown) {
  const status = (e as { status?: number })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  return [401, 403, 429, 500, 503].includes(status ?? 0) || (status === 400 && /api key/i.test(msg)) ||
    /RESOURCE_EXHAUSTED|quota|API key not valid|PERMISSION_DENIED|UNAVAILABLE|high demand/i.test(msg);
}

// Minimum gap between Gemini call starts (per server instance), to stay under rate limits.
let nextSlot = 0;
async function throttle() {
  const gap = Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 1000);
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + gap;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

type GenArgs = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

async function generateWithFallback(args: GenArgs) {
  const keys = apiKeys();
  let lastErr: unknown;
  // Two passes over the keys, with a short pause between passes for overload spikes.
  for (let i = 0; i < keys.length * 2; i++) {
    if (i === keys.length) await new Promise((r) => setTimeout(r, 2000));
    const idx = (preferred + i) % keys.length;
    const key = keys[idx];
    if (!clients.has(key)) clients.set(key, new GoogleGenAI({ apiKey: key }));
    try {
      await throttle();
      const res = await clients.get(key)!.models.generateContent(args);
      preferred = idx;
      return res;
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e;
      console.warn(`Gemini key #${idx + 1} failed (${(e as { status?: number }).status ?? "?"}); trying next key.`);
    }
  }
  throw new Error(`All ${keys.length} Gemini keys failed. Last error: ${lastErr instanceof Error ? lastErr.message.slice(0, 300) : String(lastErr)}`);
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
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateWithFallback({
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
