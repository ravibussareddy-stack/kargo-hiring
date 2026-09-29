import "server-only";
import { db } from "./supabase";

// Original CV files live in a PRIVATE bucket, one folder per candidate: <candidateId>/original.<ext>.
// Only server code (service key) can read it; the dashboard serves files behind the login.
const BUCKET = "cvs";

export const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
};

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { data } = await db().storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await db().storage.createBucket(BUCKET, { public: false, fileSizeLimit: "10MB" });
    if (error && !/already exists/i.test(error.message)) throw new Error(`Storage: ${error.message}`);
  }
  bucketReady = true;
}

const extOf = (fileName: string) => (fileName.toLowerCase().split(".").pop() ?? "bin").replace(/[^a-z0-9]/g, "");

export async function saveOriginal(candidateId: string, fileName: string, buf: Buffer) {
  await ensureBucket();
  const ext = extOf(fileName);
  const { error } = await db().storage.from(BUCKET).upload(`${candidateId}/original.${ext}`, buf, {
    contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
    upsert: true,
  });
  if (error) throw new Error(`Storage: ${error.message}`);
}

/** The stored original, or null if this candidate has none (e.g. uploaded before originals were kept). */
export async function getOriginal(candidateId: string): Promise<{ body: ArrayBuffer; ext: string } | null> {
  await ensureBucket();
  const { data: files } = await db().storage.from(BUCKET).list(candidateId);
  const f = files?.find((x) => x.name.startsWith("original."));
  if (!f) return null;
  const { data, error } = await db().storage.from(BUCKET).download(`${candidateId}/${f.name}`);
  if (error || !data) return null;
  return { body: await data.arrayBuffer(), ext: f.name.split(".").pop()! };
}

export async function hasOriginals(ids: string[]): Promise<Set<string>> {
  await ensureBucket();
  // One listing of the bucket root gives every candidate folder that exists.
  const { data } = await db().storage.from(BUCKET).list("", { limit: 10000 });
  const folders = new Set((data ?? []).map((x) => x.name));
  return new Set(ids.filter((id) => folders.has(id)));
}

export async function removeOriginal(candidateId: string) {
  const { data: files } = await db().storage.from(BUCKET).list(candidateId);
  if (files?.length) await db().storage.from(BUCKET).remove(files.map((f) => `${candidateId}/${f.name}`));
}
