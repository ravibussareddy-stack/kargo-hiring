import "server-only";
import { NextResponse } from "next/server";

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export type IdCtx = { params: Promise<{ id: string }> };
