import { fuzzyEquals, normalizeText, tokenize } from "../whatsapp-text";
import type { DetectedIntent, GradeCode, Intent, QuantityUnitCode, RawEntities, WebsiteTarget } from "../whatsapp.types";

/**
 * Deterministic command + entity parser. This is the ONLY thing that runs for
 * plain commands ("buyer", "bhav", "payment"…) and for most natural-language
 * Hindi/Hinglish/English requests, so the LLM is never called for them.
 */

const K = {
  payment: ["payment", "payments", "paisa", "paise", "paisaa", "bhugtan", "भुगतान", "पैसा", "पैसे", "पेमेंट", "payout"],
  shipment: ["shipment", "shipments", "delivery", "deliveries", "tracking", "track", "pahucha", "pahuncha", "pahunchi", "शिपमेंट", "डिलीवरी", "पहुंचा", "पहुँचा"],
  offer: ["offer", "offers", "ऑफर", "proposal"],
  price: ["bhav", "bhaav", "bhaw", "bhao", "price", "prices", "rate", "rates", "mandi", "mandee", "daam", "भाव", "मंडी", "दाम", "रेट"],
  buyer: ["buyer", "buyers", "kharidar", "khareedar", "kharidaar", "vyapari", "vyapaari", "trader", "खरीदार", "ख़रीदार", "व्यापारी", "बायर"],
  lot: ["lot", "lots", "fasal", "fasl", "crop", "crops", "stock", "लॉट", "फसल", "फ़सल"],
  help: ["help", "menu", "options", "option", "madad", "madat", "sahayata", "मदद", "सहायता", "मेनू"],
  cancel: ["cancel", "stop", "reset", "restart", "रद्द"],
  back: ["back", "peeche", "wapas", "vapas", "पीछे", "वापस"],
  greeting: ["hi", "hello", "hey", "hii", "namaste", "namaskar", "नमस्ते", "नमस्कार", "हेलो"],
  yes: ["yes", "y", "haan", "han", "ha", "haa", "ji", "ok", "okay", "sahi", "confirm", "theek", "thik", "हाँ", "हां", "जी", "ठीक"],
  no: ["no", "n", "nahi", "nahin", "nai", "nope", "नहीं", "ना"],
  have: ["hai", "hain", "have", "hoon", "है", "हैं"],
  sell: ["sell", "bechna", "bechni", "bech", "bechu", "bechun", "bechoon", "bikri", "बेचना", "बेचनी", "बेच", "बेचूं", "बेचूँ"],
  where: ["kaha", "kahan", "कहाँ", "कहां", "where", "status", "kab", "कब"],
  maal: ["maal", "mal", "माल"],
  about: ["about", "process", "explain", "explanation", "samjhao", "samjhaiye", "intro", "introduction", "जानकारी", "परिचय"],
};

/** "How does Anndata work" phrasings (matched on normalized text: lowercase, punctuation → space). */
const ABOUT_PHRASES =
  /(how (does|do|it|anndata|this|to use)|how .{0,20} works?|kaise (kaam|kam|chalta|chalti|karta|kare|use)|what is anndata|what s anndata|about anndata|anndata (kya|kaise|ke bare|ke baare)|कैसे (काम|चलता|चलती)|फार्मलिंक (क्या|कैसे))/u;

const WEBSITE_KEYWORDS: Array<{ words: string[]; target: WebsiteTarget }> = [
  { words: ["warehouse", "warehouses", "godown", "storage", "गोदाम"], target: "warehouses" },
  { words: ["store", "hold"], target: "sellVsStore" },
  { words: ["forecast", "forecasts", "predict", "prediction", "अनुमान"], target: "forecasts" },
  { words: ["transport", "logistics", "vehicle", "परिवहन"], target: "logistics" },
  { words: ["profile", "account", "प्रोफाइल"], target: "profile" },
  { words: ["transaction", "transactions", "history", "report", "reports", "analytics", "statement", "इतिहास"], target: "transactions" },
  { words: ["register", "signup", "onboarding", "रजिस्टर"], target: "register" },
  { words: ["dashboard", "website", "site", "app", "portal", "anndata", "web", "डैशबोर्ड", "वेबसाइट"], target: "dashboard" },
  { words: ["farm", "farms", "khet", "खेत"], target: "farms" },
  { words: ["complaint", "grievance", "dispute", "shikayat", "शिकायत"], target: "dashboard" },
];

// Crop names are matched against the DB by CatalogService; these aliases only
// help the *language* layer map common Hindi/Hinglish words to an English token.
export const CROP_ALIASES: Record<string, string> = {
  gehu: "wheat", gehun: "wheat", gehoon: "wheat", गेहूं: "wheat", गेहूँ: "wheat", wheat: "wheat",
  soybean: "soybean", soyabean: "soybean", soya: "soybean", soybeans: "soybean", सोयाबीन: "soybean",
  chawal: "rice", dhan: "rice", rice: "rice", paddy: "rice", चावल: "rice", धान: "rice",
  makka: "maize", makki: "maize", maize: "maize", corn: "maize", मक्का: "maize",
  chana: "gram", gram: "gram", chickpea: "gram", चना: "gram",
  arhar: "tur", tur: "tur", toor: "tur", tuar: "tur", अरहर: "tur", तुअर: "tur",
  moong: "moong", mung: "moong", मूंग: "moong",
  urad: "urad", उड़द: "urad",
  bajra: "bajra", bajri: "bajra", बाजरा: "bajra",
  jowar: "jowar", jwar: "jowar", ज्वार: "jowar",
  sarson: "mustard", mustard: "mustard", सरसों: "mustard",
  kapas: "cotton", cotton: "cotton", कपास: "cotton",
  pyaj: "onion", pyaaz: "onion", onion: "onion", pyaz: "onion", प्याज: "onion",
  aloo: "potato", alu: "potato", potato: "potato", आलू: "potato",
  tamatar: "tomato", tomato: "tomato", टमाटर: "tomato",
  lehsun: "garlic", lahsun: "garlic", garlic: "garlic", लहसुन: "garlic",
  ganna: "sugarcane", sugarcane: "sugarcane", गन्ना: "sugarcane",
  masoor: "lentil", masur: "lentil", lentil: "lentil", मसूर: "lentil",
  groundnut: "groundnut", moongfali: "groundnut", mungfali: "groundnut", मूंगफली: "groundnut",
};

/**
 * Keyword match with typo tolerance — except that a token which is itself a
 * crop name is only ever matched exactly ("rice" must never fuzzy-match the
 * keyword "price").
 */
// Common words that sit one typo away from a command keyword ("kaise" = how, vs
// "paise" = money) and must therefore only ever match exactly.
const NEVER_FUZZY = new Set(["kaise", "kaisa", "kaisi", "kese"]);

function hasKeyword(tokens: string[], keywords: readonly string[]): boolean {
  return tokens.some((tok) => keywords.includes(tok) || (!CROP_ALIASES[tok] && !NEVER_FUZZY.has(tok) && keywords.some((k) => fuzzyEquals(tok, k))));
}

const UNIT_MAP: Record<string, QuantityUnitCode> = {
  quintal: "QTL", quintals: "QTL", qtl: "QTL", qtls: "QTL", q: "QTL", kwintal: "QTL", quental: "QTL", क्विंटल: "QTL", क्वींटल: "QTL",
  kg: "KG", kgs: "KG", kilo: "KG", kilos: "KG", kilogram: "KG", किलो: "KG", किलोग्राम: "KG",
  ton: "TONNE", tons: "TONNE", tonne: "TONNE", tonnes: "TONNE", tan: "TONNE", टन: "TONNE",
};

export function extractQuantity(normalized: string): { quantity: number; unit: QuantityUnitCode } | null {
  const m = normalized.match(/(\d+(?:[.,]\d+)?)\s*([a-z\p{Script=Devanagari}]+)/u);
  if (!m) return null;
  const unit = UNIT_MAP[m[2]!];
  if (!unit) return null;
  const quantity = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return null;
  return { quantity, unit };
}

/** Bare number (used when we asked "how much?"). Defaults the unit to quintal. */
export function extractBareQuantity(normalized: string): { quantity: number; unit: QuantityUnitCode } | null {
  const withUnit = extractQuantity(normalized);
  if (withUnit) return withUnit;
  const m = normalized.match(/^(\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const quantity = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return null;
  return { quantity, unit: "QTL" };
}

export function extractCropWord(tokens: string[]): string | undefined {
  for (const t of tokens) {
    const alias = CROP_ALIASES[t];
    if (alias) return alias;
  }
  return undefined;
}

export function extractGrade(normalized: string, allowBare: boolean): GradeCode | undefined {
  if (/(pata nahi|nahi pata|dont know|don t know|do not know|not sure|unknown|पता नहीं)/u.test(normalized)) return "UNKNOWN";
  const m = normalized.match(/(?:^|\s)(?:grade|quality|gred|ग्रेड)\s*([abcd])(?:\s|$)/u) ?? normalized.match(/(?:^|\s)([abcd])\s*(?:grade|quality|gred)(?:\s|$)/u);
  if (m) return m[1]!.toUpperCase() as GradeCode;
  if (allowBare) {
    const b = normalized.match(/^([abcd])$/u);
    if (b) return b[1]!.toUpperCase() as GradeCode;
  }
  return undefined;
}

const LOC_STOP = new Set(["my", "the", "a", "an", "hai", "hain", "quintal", "kg", "for", "me", "mein", "hoon"]);

/** "in Sehore", "Sehore mein", "at Indore", "Sehore me hai" → location text. */
export function extractLocationPhrase(normalized: string): string | undefined {
  const pre = normalized.match(/(?:^|\s)(?:in|at|from|near|location)\s+([a-z\p{Script=Devanagari}]+(?:\s[a-z\p{Script=Devanagari}]+)?)/u);
  if (pre && !LOC_STOP.has(pre[1]!.split(" ")[0]!)) return cleanLoc(pre[1]!);
  const post = normalized.match(/([a-z\p{Script=Devanagari}]+)\s+(?:mein|me|में|se|par|pe)(?:\s|$)/u);
  if (post && !LOC_STOP.has(post[1]!) && !UNIT_MAP[post[1]!] && !CROP_ALIASES[post[1]!]) return cleanLoc(post[1]!);
  return undefined;
}
const LOC_END = new Set(["hai", "hain", "me", "mein", "hoon", "ke", "ka", "ki", "aur", "and", "with", "grade", "quality", "gred", "for", "ho", "se", "par", "pe", "wheat", "quintal", "kg", "ton", "a", "b", "c", "d"]);
function cleanLoc(s: string): string {
  const out: string[] = [];
  for (const w of s.split(" ")) {
    if (LOC_END.has(w) || UNIT_MAP[w] || CROP_ALIASES[w]) break;
    out.push(w);
  }
  return out.join(" ").trim();
}

/**
 * Parse a message into a command/intent plus raw entities. Returns UNKNOWN
 * (confidence 0) when the text is not a recognised command — the caller then
 * treats it as a field answer or, if configured, asks the AI layer.
 */
export function parseMessage(raw: string): DetectedIntent {
  const n = normalizeText(raw);
  const tokens = tokenize(n);
  const entities: RawEntities = {};
  const empty = (): DetectedIntent => ({ intent: "UNKNOWN", entities, confidence: 0, source: "none" });
  if (tokens.length === 0) return empty();

  const qty = extractQuantity(n);
  if (qty) {
    entities.quantity = qty.quantity;
    entities.unit = qty.unit;
  }
  const crop = extractCropWord(tokens);
  if (crop) entities.crop = crop;
  const grade = extractGrade(n, false);
  if (grade) entities.qualityGrade = grade;
  const loc = extractLocationPhrase(n);
  if (loc) entities.location = loc;

  const short = tokens.length <= 3;
  const done = (intent: Intent, confidence: number, source: DetectedIntent["source"], websiteTarget?: WebsiteTarget): DetectedIntent => ({
    intent,
    entities,
    confidence,
    source,
    ...(websiteTarget ? { websiteTarget } : {}),
  });
  const cmdSource: DetectedIntent["source"] = short ? "command" : "rules";
  const cmdConf = short ? 1 : 0.9;

  if (short && hasKeyword(tokens, K.cancel)) return done("CANCEL", 1, "command");
  if (short && hasKeyword(tokens, K.back)) return done("BACK", 1, "command");
  if (hasKeyword(tokens, K.help) || /kya kar sakte ho|kya kar sakta/.test(n)) return done("HELP", 1, "command");
  if (tokens.length === 1 && hasKeyword(tokens, K.greeting)) return done("HELP", 1, "command");

  // Precedence: payment > shipment > offers > bhav > buyer > lots.
  if (hasKeyword(tokens, K.payment)) return done("VIEW_PAYMENT", cmdConf, cmdSource);
  const maalWhere = hasKeyword(tokens, K.maal) && hasKeyword(tokens, K.where);
  if (hasKeyword(tokens, K.shipment) || maalWhere) return done("VIEW_SHIPMENT", cmdConf, cmdSource);
  if (hasKeyword(tokens, K.offer)) return done("VIEW_OFFERS", cmdConf, cmdSource);
  if (hasKeyword(tokens, K.price)) return done("CHECK_MANDI_PRICE", cmdConf, cmdSource);
  if (hasKeyword(tokens, K.buyer)) return done("FIND_BUYER", cmdConf, cmdSource);
  if (hasKeyword(tokens, K.lot)) return done("VIEW_LOTS", cmdConf, cmdSource);

  // "sell 20 quintal wheat" / "mere paas 20 quintal gehu hai" → buyer flow.
  const hasSell = hasKeyword(tokens, K.sell);
  const hasHave = hasKeyword(tokens, K.have) || /(mere paas|i have|mere pas)/.test(n);
  if ((hasSell || hasHave) && (entities.crop || entities.quantity)) return done("FIND_BUYER", 0.85, "rules");
  if (hasSell) return done("FIND_BUYER", 0.8, "rules");

  // "How does Anndata work?" — after every action command so "payment kaise milega"
  // or "how to sell wheat" keep their own meaning.
  if (ABOUT_PHRASES.test(n) || hasKeyword(tokens, K.about)) return done("ABOUT", cmdConf, cmdSource);

  // Website-fallback vocabulary (understood, but not doable inside WhatsApp).
  for (const w of WEBSITE_KEYWORDS) {
    if (hasKeyword(tokens, w.words)) return done("WEBSITE", 0.8, "rules", w.target);
  }
  return empty();
}

const firstToken = (raw: string): string[] => tokenize(normalizeText(raw)).slice(0, 3);
export function isYes(raw: string): boolean {
  const t = firstToken(raw);
  return t.length > 0 && t.length <= 2 && hasKeyword(t.slice(0, 1), K.yes);
}
export function isNo(raw: string): boolean {
  const t = firstToken(raw);
  return t.length > 0 && t.length <= 2 && hasKeyword(t.slice(0, 1), K.no);
}
export function isDontKnow(raw: string): boolean {
  return extractGrade(normalizeText(raw), false) === "UNKNOWN";
}
/** Words that mean "let me type it" in the crop menu. */
export function isOther(raw: string): boolean {
  const t = tokenize(normalizeText(raw));
  return t.length <= 2 && t.some((x) => ["other", "others", "dusra", "doosra", "aur", "anya", "अन्य", "दूसरा"].includes(x));
}
export function extractNumber(raw: string): number | null {
  const m = normalizeText(raw).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const v = Number(m[1]!.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
}
