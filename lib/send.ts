import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { db, must } from "./supabase";
import type { Pii } from "./types";

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_ADDRESS);

export function allowedDomains(): string[] {
  return (process.env.ALLOWED_RECIPIENT_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

export function allowedRecipients(): string[] {
  return (process.env.ALLOWED_RECIPIENTS ?? "").split(",").map((d) => normalizeAddress(d)).filter(Boolean);
}

/** Lowercases and drops a +tag, so "me+kavya@x.com" matches "me@x.com". */
function normalizeAddress(a: string) {
  const [local, domain] = a.trim().toLowerCase().split("@");
  return domain ? `${local.split("+")[0]}@${domain}` : "";
}

/** Allowed only if the exact address (ignoring +tags) or its whole domain is allow-listed. */
export function recipientAllowed(email: string | null): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return allowedRecipients().includes(normalizeAddress(email)) || Boolean(domain && allowedDomains().includes(domain));
}

export function fillName(text: string, name: string | null) {
  return name ? text.split("[NAME]").join(name) : text;
}

type EmailRow = { id: string; candidate_id: string; subject: string; body_template: string; edited_body: string | null; status: string };

/** Final text exactly as it will be sent. */
export function finalEmail(e: Pick<EmailRow, "subject" | "body_template" | "edited_body">, pii: Pii) {
  return { subject: fillName(e.subject, pii.name), body: fillName(e.edited_body ?? e.body_template, pii.name) };
}

export async function sendCandidateEmail(candidateId: string) {
  if (!emailConfigured()) throw new Error("Email not configured (RESEND_API_KEY / RESEND_FROM_ADDRESS).");
  const c = must(await db().from("candidates").select("id, pii, status").eq("id", candidateId).single()) as { id: string; pii: Pii; status: string };
  const e = must(await db().from("emails").select("*").eq("candidate_id", candidateId).single()) as EmailRow;
  if (c.status === "sent" || e.status === "sent") throw new Error("Already sent.");

  const to = c.pii.email;
  if (!to) throw new Error("Candidate has no email address.");
  if (!recipientAllowed(to)) throw new Error(`Blocked: ${to} is not in ALLOWED_RECIPIENTS / ALLOWED_RECIPIENT_DOMAINS.`);
  if (!c.pii.name) throw new Error("Candidate name unknown.");

  const { subject, body } = finalEmail(e, c.pii);
  if (/\[NAME\]|\[REDACTED\]/.test(subject + body)) throw new Error("Refusing to send: [NAME] or [REDACTED] still present.");

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send(
    { from: process.env.RESEND_FROM_ADDRESS!, to, subject, text: body },
    // Same content => same key, so a double-click can never send twice.
    { idempotencyKey: `kargo-${e.id}-${createHash("sha256").update(to + subject + body).digest("hex").slice(0, 16)}` },
  );
  if (error || !data) {
    const msg = error?.message ?? "Unknown Resend error";
    must(await db().from("emails").update({ status: "failed", last_error: msg }).eq("id", e.id));
    throw new Error(msg);
  }
  const now = new Date().toISOString();
  must(await db().from("emails").update({ status: "sent", last_error: null, updated_at: now }).eq("id", e.id));
  must(await db().from("candidates").update({ status: "sent", sent_at: now, resend_message_id: data.id }).eq("id", candidateId));
  return { id: data.id, sent_at: now };
}
