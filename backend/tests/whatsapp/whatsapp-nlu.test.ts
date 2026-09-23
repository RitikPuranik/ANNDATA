import { parseMessage } from "../../src/modules/whatsapp/nlu/whatsapp-command-parser";
import { WhatsAppIntentService } from "../../src/modules/whatsapp/nlu/whatsapp-intent.service";
import { WhatsAppRateLimiter } from "../../src/modules/whatsapp/whatsapp-rate-limiter";
import { GeminiNluProvider } from "../../src/modules/whatsapp/nlu/whatsapp-nlu.provider";
import { testConfig } from "./harness";
import type { WhatsAppNluProvider } from "../../src/modules/whatsapp/nlu/whatsapp-nlu.provider";

const intent = (t: string) => parseMessage(t).intent;

describe("deterministic command parser", () => {
  const table: Array<[string, string[]]> = [
    ["FIND_BUYER", ["buyer", "Buyers", "find buyer", "buyer chahiye", "mujhe buyer chahiye", "mere lot ke liye buyer dhoondo", "buyer dhundho", "BUYER", "खरीदार", "byer", "buyar"]],
    ["CHECK_MANDI_PRICE", ["bhav", "price", "mandi price", "aaj ka bhav", "gehu ka bhav", "soybean ka bhav", "mandi mein kya rate hai", "भाव", "bhaav", "mera soybean ka bhav batao"]],
    ["VIEW_LOTS", ["my lot", "my lots", "lots", "mera lot", "mere lot", "meri fasal", "my crop", "mere kitne lot active hain?", "Mere active lot dikhao"]],
    ["VIEW_OFFERS", ["offers", "my offers", "offers dikhao", "buyer offer", "buyer offers", "mujhe offers dikhao", "ABC buyer ne kya offer diya?", "ऑफर", "ofers"]],
    ["VIEW_PAYMENT", ["payment", "payments", "mera payment", "payment status", "paisa kab milega", "payment kab aayega", "mera paisa kab milega?", "भुगतान", "peyment"]],
    ["VIEW_SHIPMENT", ["shipment", "my shipment", "delivery", "meri shipment", "mera maal kaha hai", "delivery status", "Meri shipment kaha hai?", "mera maal kaha pahucha?", "शिपमेंट", "shipmnt"]],
    ["HELP", ["help", "menu", "options", "madad", "kya kar sakte ho", "hi", "namaste", "मदद", "HELP!!"]],
    ["ABOUT", ["how it works", "How does Anndata work?", "what is anndata", "about anndata", "anndata kya hai", "anndata kaise kaam karta hai", "kaise kaam karta hai", "explain the process", "samjhao", "फार्मलिंक कैसे काम करता है"]],
  ];
  for (const [expected, inputs] of table) {
    it.each(inputs)(`"%s" → ${expected}`, (text) => {
      expect(intent(text)).toBe(expected);
    });
  }

  it("ABOUT never steals a real action: 'kaise' / 'how' / 'process' beside an action word keep that action", () => {
    expect(intent("payment kaise milega")).toBe("VIEW_PAYMENT");
    expect(intent("payment process")).toBe("VIEW_PAYMENT");
    expect(intent("how to sell wheat")).toBe("FIND_BUYER");
    expect(intent("kaise bechu gehu")).toBe("FIND_BUYER");
    expect(intent("bhav kaise dekhu")).toBe("CHECK_MANDI_PRICE");
    expect(intent("how much is the price")).toBe("CHECK_MANDI_PRICE");
    expect(intent("mera maal kaha hai")).toBe("VIEW_SHIPMENT");
  });

  it("'kaise' (how) is never fuzzy-matched to 'paise' (money)", () => {
    expect(intent("kaise")).not.toBe("VIEW_PAYMENT");
    expect(intent("paise")).toBe("VIEW_PAYMENT"); // the real word still works
    expect(intent("paisa kab milega")).toBe("VIEW_PAYMENT");
  });

  it("cancel and back are controlled intents", () => {
    expect(intent("cancel")).toBe("CANCEL");
    expect(intent("back")).toBe("BACK");
    expect(intent("wapas")).toBe("BACK");
  });

  it("is case-insensitive and ignores emoji/punctuation", () => {
    expect(intent("  PAYMENT ?? 💰 ")).toBe("VIEW_PAYMENT");
    expect(intent("BhAv")).toBe("CHECK_MANDI_PRICE");
  });

  it("extracts crop, quantity, unit and location from a natural sentence", () => {
    const r = parseMessage("Mere paas 20 quintal wheat hai, buyer dhoondho");
    expect(r.intent).toBe("FIND_BUYER");
    expect(r.entities).toMatchObject({ crop: "wheat", quantity: 20, unit: "QTL" });
  });

  it("'Mere paas 20 quintal gehu hai' → FIND_BUYER with wheat", () => {
    const r = parseMessage("Mere paas 20 quintal gehu hai");
    expect(r.intent).toBe("FIND_BUYER");
    expect(r.entities).toMatchObject({ crop: "wheat", quantity: 20, unit: "QTL" });
  });

  it("extracts location and grade when present", () => {
    const r = parseMessage("Mere paas 20 quintal gehu hai, Sehore mein hai");
    expect(r.entities).toMatchObject({ crop: "wheat", quantity: 20, location: "sehore" });
    expect(parseMessage("20 quintal wheat in Sehore grade A").entities).toMatchObject({ location: "sehore", qualityGrade: "A" });
  });

  it("'25 quintal soybean ka bhav kya hai?' is a price question, not a sell flow", () => {
    const r = parseMessage("25 quintal soybean ka bhav kya hai?");
    expect(r.intent).toBe("CHECK_MANDI_PRICE");
    expect(r.entities.crop).toBe("soybean");
  });

  it("units: kg, ton, Hindi", () => {
    expect(parseMessage("500 kg gehu hai").entities).toMatchObject({ quantity: 500, unit: "KG" });
    expect(parseMessage("2 ton wheat sell").entities).toMatchObject({ quantity: 2, unit: "TONNE" });
    expect(parseMessage("20 क्विंटल गेहूं है").entities).toMatchObject({ quantity: 20, unit: "QTL", crop: "wheat" });
  });

  it("website vocabulary maps to a fallback target, never a dead end", () => {
    expect(parseMessage("show my transaction history").websiteTarget).toBe("transactions");
    expect(parseMessage("warehouse chahiye").websiteTarget).toBe("warehouses");
    expect(parseMessage("open website").websiteTarget).toBe("dashboard");
    expect(parseMessage("transport book karna hai").websiteTarget).toBe("logistics");
  });

  it("unrecognised text is UNKNOWN with zero confidence", () => {
    const r = parseMessage("asdf qwerty zzz");
    expect(r.intent).toBe("UNKNOWN");
    expect(r.confidence).toBe(0);
  });
});

const flush = () => new Promise((r) => setImmediate(r));
const svc = (nlu: WhatsAppNluProvider, limit = 30) => new WhatsAppIntentService(nlu, new WhatsAppRateLimiter(), limit);
const provider = (fn: () => Promise<unknown>): WhatsAppNluProvider & { calls: number } => {
  const p = { name: "fake", calls: 0, extract: async () => { p.calls++; return fn(); } };
  return p;
};

describe("intent service — AI is optional, validated, and cost-controlled", () => {
  it("never calls the LLM for plain commands or rule-matched phrases", async () => {
    const p = provider(async () => { throw new Error("must not be called"); });
    const s = svc(p);
    for (const text of ["buyer", "bhav", "offers", "payment", "mera paisa kab milega", "Mere paas 20 quintal wheat hai"]) {
      const r = await s.detect(text, { language: "en", rateKey: "u" });
      expect(r.intent).not.toBe("UNKNOWN");
      expect(r.source).not.toBe("ai");
    }
    expect(p.calls).toBe(0);
  });

  it("22. invalid AI JSON is treated as UNKNOWN", async () => {
    for (const bad of [null, "not json", { intent: "DROP_TABLE", entities: {}, confidence: 1 }, { intent: "FIND_BUYER", entities: { quantity: -5 }, confidence: 1 }, { intent: "FIND_BUYER", entities: { evil: "x" }, confidence: 1 }, { intent: "FIND_BUYER", confidence: 7 }]) {
      const p = provider(async () => bad);
      const r = await svc(p).detect("kuch alag sa sawaal hai mera", { language: "hinglish", rateKey: "u" });
      expect(r.intent).toBe("UNKNOWN");
    }
  });

  it("23. low-confidence AI intent is treated as UNKNOWN", async () => {
    const p = provider(async () => ({ intent: "FIND_BUYER", entities: {}, confidence: 0.3 }));
    const r = await svc(p).detect("kuch alag sa sawaal hai mera", { language: "hinglish", rateKey: "u" });
    expect(r.intent).toBe("UNKNOWN");
  });

  it("accepts a valid, confident AI result", async () => {
    const p = provider(async () => ({ intent: "VIEW_OFFERS", entities: {}, confidence: 0.9 }));
    const r = await svc(p).detect("kya kisi ne mujhe proposal bheja", { language: "hinglish", rateKey: "u" });
    // (rules may or may not catch this phrase; either way the outcome is a valid intent)
    expect(["VIEW_OFFERS"]).toContain(r.intent);
  });

  it("AI provider errors fall back to UNKNOWN (no throw)", async () => {
    const p = provider(async () => { throw new Error("boom"); });
    const r = await svc(p).detect("kuch alag sa sawaal hai mera", { language: "en", rateKey: "u" });
    expect(r.intent).toBe("UNKNOWN");
  });

  it("caps AI calls per farmer per hour", async () => {
    const p = provider(async () => ({ intent: "UNKNOWN", entities: {}, confidence: 0.9 }));
    const s = svc(p, 2);
    for (let i = 0; i < 5; i++) await s.detect(`gibberish sentence number ${i} here`, { language: "en", rateKey: "limited-user" });
    expect(p.calls).toBe(2);
    await flush();
  });

  it("Gemini provider sends the key in a header (not the URL), and returns null for unparseable output", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    const fetchImpl = (async (url: string, init: any) => {
      seenUrl = url; seenHeaders = init.headers;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "```not json```" }] } }] }) } as any;
    }) as unknown as typeof fetch;
    const g = new GeminiNluProvider(testConfig({ geminiApiKey: "GEMINI-SECRET" }), fetchImpl);
    expect(await g.extract("hello there friend", { language: "en" })).toBeNull();
    expect(seenUrl).not.toContain("GEMINI-SECRET");
    expect(seenHeaders["x-goog-api-key"]).toBe("GEMINI-SECRET");
  });
});
