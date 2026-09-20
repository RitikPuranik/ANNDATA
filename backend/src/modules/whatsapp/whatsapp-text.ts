import type { Lang } from "./whatsapp.types";

const KEYCAPS: Record<string, string> = {
  "1️⃣": "1", "2️⃣": "2", "3️⃣": "3", "4️⃣": "4", "5️⃣": "5",
  "6️⃣": "6", "7️⃣": "7", "8️⃣": "8", "9️⃣": "9", "🔟": "10",
};
const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** Lowercase, keycap/Devanagari digits → ASCII, strip punctuation & emoji, collapse spaces. */
export function normalizeText(input: string): string {
  let s = input.normalize("NFKC");
  for (const [k, v] of Object.entries(KEYCAPS)) s = s.split(k).join(` ${v} `);
  s = s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  s = s.toLowerCase();
  // keep latin letters, digits, devanagari, whitespace, and . , (for decimals)
  s = s.replace(/[^\p{Script=Latin}\p{Script=Devanagari}\p{N}\s.,]/gu, " ");
  s = s.replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function tokenize(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length]!;
}

/** Fuzzy token match: short words must match exactly; longer ones tolerate typos. */
export function fuzzyEquals(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  const len = keyword.length;
  if (len <= 4) return false;
  const allowed = len >= 8 ? 2 : 1;
  return levenshtein(token, keyword, allowed) <= allowed;
}

export function hasKeyword(tokens: string[], keywords: readonly string[]): boolean {
  return tokens.some((t) => keywords.some((k) => fuzzyEquals(t, k)));
}

/** Bare number reply such as "2", "2️⃣" or "2." → 2. */
export function parseBareNumber(raw: string): number | null {
  const n = normalizeText(raw);
  return /^\d{1,2}$/.test(n) ? Number(n) : null;
}

// Grammar/function words only. Command vocabulary ("bhav", "gehu", "fasal"…) is
// deliberately absent: typing a bare command must not flip the reply language.
const HINGLISH_HINTS = [
  "mera", "mere", "meri", "mujhe", "kya", "hai", "hain", "batao", "bataiye", "dikhao", "dikhaye",
  "kab", "kaha", "kahan", "chahiye", "dhoondo", "dhundho", "dhoondho", "paas", "nahi", "haan",
  "kitna", "kitne", "aayega", "milega", "karo", "kar", "aaj", "ka", "ki", "ke", "mein",
  "bechna", "kaise", "pahucha", "diya", "hoon",
];

export function detectLanguage(raw: string, _current: Lang): Lang | null {
  if (/[\u0900-\u097F]/.test(raw)) return "hi";
  const tokens = tokenize(normalizeText(raw));
  if (tokens.length === 0) return null;
  const hits = tokens.filter((t) => HINGLISH_HINTS.includes(t)).length;
  if (hits >= 1 && hits / tokens.length >= 0.2) return "hinglish";
  // Pure English with ≥3 words and zero hints → English; a single ambiguous word keeps current.
  if (tokens.length >= 3 && hits === 0 && /^\p{ASCII}+$/u.test(raw)) return "en";
  return null;
}

export function maskTail(value: string | null | undefined, keep = 4, prefix = ""): string {
  if (!value) return "";
  const tail = value.slice(-keep);
  return `${prefix}••••${tail}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  // IST (UTC+5:30) — FarmLink's farmers are in India.
  const ist = new Date(date.getTime() + 5.5 * 3600_000);
  const h = ist.getUTCHours();
  const m = String(ist.getUTCMinutes()).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${h12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

export function inr(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "₹-";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
export function num(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 3 }) : "-";
}
export function unitShort(unit: string): string {
  return unit === "QTL" ? "Q" : unit === "KG" ? "kg" : unit === "TONNE" ? "ton" : unit;
}
export function unitLong(unit: string): string {
  return unit === "QTL" ? "quintal" : unit === "KG" ? "kg" : unit === "TONNE" ? "ton" : unit;
}
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}
