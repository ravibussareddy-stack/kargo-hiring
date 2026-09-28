// Deterministic PII extraction, redaction and guard. No AI is involved here.
import type { LocationFlag, Pii } from "./types";

export const REDACTED = "[REDACTED]";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>()|,;]+|(?:[a-z0-9-]+\.)*(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com|notion\.site|about\.me|substack\.com)\/[^\s<>()|,;]*/gi;
// Candidate phone runs: digits with optional + ( ) space . - separators.
const PHONE_CANDIDATE_RE = /(?:\+|\()?\d[\d\s().-]{7,}\d/g;
// Indian mobile, matched without boundaries so glued duplicates ("…1134598202 11345") are both found.
const IN_MOBILE_RE = /(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)|(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
const ADDRESS_HINT_RE =
  /\b(flat|apt|apartment|floor|wing|bldg|building|tower|road|rd\.?|street|st\.?|lane|marg|nagar|sector|society|chs|plot|house no|near|opp\.?|colony|layout|cross)\b/i;

// Words that mark a line as a heading, title, institution or place — not a person's name.
const NOT_A_NAME = new RegExp(
  "\\b(" +
    [
      "resume", "résumé", "curriculum", "vitae", "cv", "profile", "summary", "synopsis", "objective", "contact", "email", "phone", "mobile", "address", "linkedin", "portfolio", "links",
      "experience", "education", "skills", "competencies", "competencie", "projects", "project", "certifications", "achievements", "publications", "involvement", "interests", "languages", "qualifications", "internships", "awards", "work", "professional", "core", "technical", "academic", "personal", "research", "scholastic", "extracurricular", "sample", "assignments",
      "product", "manager", "engineer", "lead", "leader", "head", "founder", "builder", "strategist", "strategy", "operations", "marketing", "growth", "associate", "analyst", "consultant", "director", "intern", "senior", "program", "venture", "advisory", "office",
      "university", "college", "institute", "school", "academy", "iit", "iim", "imt", "nit", "bits", "ltd", "pvt", "inc", "llp", "technologies", "solutions", "services", "logistics", "labs",
      "india", "delhi", "ncr", "mumbai", "bombay", "bangalore", "bengaluru", "pune", "chennai", "hyderabad", "kolkata", "gurgaon", "gurugram", "noida", "ghaziabad", "kharagpur", "aurangabad", "kalaburagi", "remote", "years",
    ].join("|") +
    ")\\b",
  "i",
);
const NAME_TOKEN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’-]*$/;

export function looksLikeName(line: string): boolean {
  const cleaned = undouble(line.replace(/\s+/g, " ").trim());
  if (!cleaned || cleaned.length > 60 || NOT_A_NAME.test(cleaned)) return false;
  const tokens = cleaned.split(" ");
  if (tokens.length < 2 || tokens.length > 4) return false;
  return tokens.every((t) => NAME_TOKEN.test(t) && /^[A-ZÀ-Ö]/.test(t));
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Name heuristic: explicit "Name:" line, else the document's top heading
 * (passed in from .docx), else the first plausible line near the top.
 */
export function findName(text: string, headingHint?: string | null): string | null {
  const explicit = text.match(/^\s*(?:full\s+)?name\s*[:\-–]\s*(.+)$/im);
  if (explicit && looksLikeName(explicit[1])) return normalizeName(explicit[1]);
  if (headingHint && looksLikeName(headingHint)) return normalizeName(headingHint);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6);
  for (const raw of lines) {
    // Header lines are often "Name | email | phone" or "Name email" — drop contacts, take the first segment.
    const stripped = raw.replace(EMAIL_RE, "|").replace(URL_RE, "|").replace(PHONE_CANDIDATE_RE, "|");
    const first = stripped.split(/\s*[|•·,–—]\s*|\s{3,}/)[0];
    if (looksLikeName(first)) return normalizeName(first);
  }
  return null;
}

/** PDFs sometimes stamp the name twice, glued: "ROHAN MEHTARohan Mehta" -> "ROHAN MEHTA". */
function undouble(s: string) {
  return s.match(/^(.+?)\s*\1$/i)?.[1] ?? s;
}

function normalizeName(n: string) {
  const s = undouble(n.replace(/\s+/g, " ").trim());
  return s === s.toUpperCase() ? titleCase(s) : s;
}

function digitsOf(s: string) {
  return s.replace(/\D/g, "");
}

function findPhones(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(IN_MOBILE_RE) ?? []) out.add(m.trim());
  for (const m of text.match(PHONE_CANDIDATE_RE) ?? []) {
    const d = digitsOf(m);
    if (d.length < 10 || d.length > 13) continue;
    // Skip date ranges like "2019 - 2021 2022" — every 4-digit group looks like a year.
    const groups = m.split(/[^\d]+/).filter(Boolean);
    if (groups.every((g) => /^(19|20)\d{2}$/.test(g))) continue;
    out.add(m.trim());
  }
  return [...out];
}

function findAddress(text: string): string | null {
  // Header only, never a bullet or a sentence: addresses sit at the top of a CV.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8);
  for (const l of lines) {
    if (/^[-•*–·]/.test(l) || l.length > 150) continue;
    const labelled = l.match(/^(?:address|residence|home)\s*[:\-–]\s*(.+)$/i);
    if (labelled) return labelled[1].trim();
    for (const seg of l.split(/\s*[|•·]\s*/)) {
      const cleaned = seg.replace(EMAIL_RE, "").replace(URL_RE, "").replace(/^[\s,-]+|[\s,-]+$/g, "");
      // Needs a 6-digit Indian PIN code plus an address word or a comma.
      if (/\b\d{3}\s?\d{3}\b/.test(cleaned) && !/\d{7,}/.test(cleaned.replace(/\s/g, "")) && (ADDRESS_HINT_RE.test(cleaned) || cleaned.includes(","))) return cleaned;
    }
  }
  return null;
}

export function extractPii(text: string, headingHint?: string | null): Pii {
  const urls = [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.)\]]+$/, "")))];
  return {
    name: findName(text, headingHint),
    email: text.match(EMAIL_RE)?.[0] ?? null,
    phone: findPhones(text),
    urls,
    address: findAddress(text),
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex matching a phone's digits with any separators between them. */
function phoneRegex(phone: string): RegExp {
  const d = digitsOf(phone).slice(-10); // local part; country code may vary in formatting
  return new RegExp(d.split("").join("[\\s().+-]*"), "g");
}

function nameTokens(name: string): string[] {
  return name
    .split(/[\s.'’-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

const CITY_KEEP = /\b(mumbai|bombay|navi mumbai|thane|pune|bengaluru|bangalore|delhi|new delhi|gurugram|gurgaon|noida|hyderabad|chennai|kolkata|ahmedabad|surat|jaipur|kochi|cochin|indore|nagpur|goa|chandigarh|lucknow|dubai|singapore|london)\b/i;

export function redact(text: string, pii: Pii): string {
  let out = text;
  // Address first (whole line), keeping the city for the location flag.
  if (pii.address) {
    const city = pii.address.match(CITY_KEEP)?.[0];
    out = out.split(pii.address).join(city ? `${REDACTED}, ${city}` : REDACTED);
  }
  // URLs and emails before name tokens (they often contain the name).
  for (const u of [...pii.urls].sort((a, b) => b.length - a.length)) out = out.split(u).join(REDACTED);
  out = out.replace(URL_RE, REDACTED);
  out = out.replace(EMAIL_RE, REDACTED);
  for (const p of pii.phone) {
    out = out.split(p).join(REDACTED);
    out = out.replace(phoneRegex(p), REDACTED);
  }
  if (pii.name) {
    out = out.replace(new RegExp(escapeRe(pii.name).replace(/\\? /g, "\\s+"), "gi"), REDACTED);
    for (const t of nameTokens(pii.name)) {
      out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRe(t)}(?![\\p{L}])`, "giu"), REDACTED);
    }
  }
  return out;
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

/**
 * Must pass before ANY text derived from a CV goes to an AI model.
 * Fails closed: a missing name is a failure.
 */
export function piiGuard(texts: string[], pii: Pii): GuardResult {
  if (!pii.name) return { ok: false, reason: "Could not identify the candidate's name, so the CV cannot be safely redacted." };
  const hay = texts.join("\n");
  const lower = hay.toLowerCase();
  if (lower.includes(pii.name.toLowerCase())) return { ok: false, reason: "Full name still present in outgoing text." };
  for (const t of nameTokens(pii.name)) {
    if (new RegExp(`(?<![\\p{L}])${escapeRe(t)}(?![\\p{L}])`, "iu").test(hay)) return { ok: false, reason: `Name token "${t}" still present in outgoing text.` };
    // Longer tokens are also checked inside words, to catch PDF text glued together ("MEHTARohan").
    if (t.length >= 5 && lower.includes(t.toLowerCase())) return { ok: false, reason: `Name token "${t}" still present inside other text.` };
  }
  if (pii.email && lower.includes(pii.email.toLowerCase())) return { ok: false, reason: "Email still present." };
  if (new RegExp(EMAIL_RE.source).test(hay)) return { ok: false, reason: "An email address is still present." };
  for (const p of pii.phone) if (new RegExp(phoneRegex(p).source).test(hay)) return { ok: false, reason: "Phone number still present." };
  if (new RegExp(IN_MOBILE_RE.source).test(hay)) return { ok: false, reason: "A mobile number is still present." };
  for (const u of pii.urls) if (hay.includes(u)) return { ok: false, reason: "Profile URL still present." };
  if (new RegExp(URL_RE.source, "i").test(hay)) return { ok: false, reason: "A profile URL is still present." };
  if (pii.address && hay.includes(pii.address)) return { ok: false, reason: "Street address still present." };
  return { ok: true };
}

/** Residence flag. Looks at the CV header first so past work locations don't count. */
export function locationFlag(text: string): LocationFlag {
  const relocating = /\b(willing|open|happy|ready)\s+to\s+relocate\b|\brelocat(e|ing)\s+to\s+mumbai\b/i.test(text);
  const header = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10).join("\n");
  const explicit = text.match(/\b(?:location|based in|residing in|current city|address)\s*[:\-–]?\s*([^\n]{0,60})/i)?.[1] ?? "";
  const zone = `${header}\n${explicit}`;
  const city = zone.match(CITY_KEEP)?.[0]?.toLowerCase();
  if (city && /mumbai|bombay|thane/.test(city)) return "mumbai";
  if (relocating) return "relocating";
  if (city) return "other";
  return "unknown";
}
