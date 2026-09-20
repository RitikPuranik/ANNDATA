import { createHmac } from "crypto";
import fs from "fs";
import path from "path";
import {
  MetaWhatsAppProvider, buildButtonsPayload, buildCtaUrlPayload, buildListPayload, buildTextPayload, buildTemplatePayload,
} from "../../src/modules/whatsapp/providers/meta-whatsapp.provider";
import { WhatsAppProviderError } from "../../src/modules/whatsapp/providers/whatsapp-provider.interface";
import { FarmLinkUrlService } from "../../src/modules/whatsapp/whatsapp-deeplink.service";
import { ALL_MESSAGE_KEYS, rawEntry, t } from "../../src/modules/whatsapp/whatsapp-i18n";
import { detectLanguage, normalizeText } from "../../src/modules/whatsapp/whatsapp-text";
import { parseMessage } from "../../src/modules/whatsapp/nlu/whatsapp-command-parser";
import { loadWhatsAppConfig } from "../../src/modules/whatsapp/whatsapp.config";
import { testConfig, APP_SECRET, VERIFY_TOKEN, buildHarness } from "./harness";

const noSleep = async () => undefined;
const res = (status: number, body: unknown): Response => ({ ok: status >= 200 && status < 300, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(2) }) as unknown as Response;

describe("MetaWhatsAppProvider", () => {
  const cfg = testConfig({ maxRetries: 2 });

  it("verifyWebhook: constant-time token check", () => {
    const p = new MetaWhatsAppProvider(cfg);
    expect(p.verifyWebhook({ mode: "subscribe", token: VERIFY_TOKEN, challenge: "c" })).toEqual({ ok: true, challenge: "c" });
    expect(p.verifyWebhook({ mode: "subscribe", token: "x", challenge: "c" })).toEqual({ ok: false });
    expect(p.verifyWebhook({ mode: "unsubscribe", token: VERIFY_TOKEN, challenge: "c" })).toEqual({ ok: false });
    expect(new MetaWhatsAppProvider(testConfig({ webhookVerifyToken: "" })).verifyWebhook({ mode: "subscribe", token: "", challenge: "c" })).toEqual({ ok: false });
  });

  it("verifySignature: valid HMAC passes; tampered body, bad format and wrong secret fail", () => {
    const p = new MetaWhatsAppProvider(cfg);
    const body = Buffer.from('{"a":1}');
    const sig = "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");
    expect(p.verifySignature(body, sig)).toBe(true);
    expect(p.verifySignature(Buffer.from('{"a":2}'), sig)).toBe(false);
    expect(p.verifySignature(body, undefined)).toBe(false);
    expect(p.verifySignature(body, "sha1=abc")).toBe(false);
    expect(p.verifySignature(body, "sha256=" + createHmac("sha256", "other").update(body).digest("hex"))).toBe(false);
    expect(new MetaWhatsAppProvider(testConfig({ appSecret: "" })).verifySignature(body, sig)).toBe(false);
  });

  it("sends with a bearer token to the configured phone number id and returns the wamid", async () => {
    const fetchImpl = jest.fn(async () => res(200, { messages: [{ id: "wamid.X" }] }));
    const p = new MetaWhatsAppProvider(cfg, fetchImpl as any, noSleep);
    expect(await p.sendTextMessage("919800000001", "hi")).toEqual({ providerMessageId: "wamid.X" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, any];
    expect(url).toBe("https://graph.example/v21.0/1000001/messages");
    expect(init.headers.Authorization).toBe("Bearer SECRET-ACCESS-TOKEN");
    expect(JSON.parse(init.body)).toMatchObject({ messaging_product: "whatsapp", to: "919800000001", type: "text" });
  });

  it("retries 429/5xx/network errors then succeeds; does not retry 4xx", async () => {
    const seq = [res(500, {}), res(429, {}), res(200, { messages: [{ id: "wamid.OK" }] })];
    const f1 = jest.fn(async () => seq.shift()!);
    expect((await new MetaWhatsAppProvider(cfg, f1 as any, noSleep).sendTextMessage("1", "x")).providerMessageId).toBe("wamid.OK");
    expect(f1).toHaveBeenCalledTimes(3);

    const f2 = jest.fn(async () => res(400, { error: { code: 131047, type: "OAuthException", message: "contains ACCESS TOKEN abc" } }));
    await expect(new MetaWhatsAppProvider(cfg, f2 as any, noSleep).sendTextMessage("1", "x")).rejects.toMatchObject({ code: "META_131047", retryable: false });
    expect(f2).toHaveBeenCalledTimes(1);

    const f3 = jest.fn(async () => { throw new Error("ECONNRESET"); });
    await expect(new MetaWhatsAppProvider(cfg, f3 as any, noSleep).sendTextMessage("1", "x")).rejects.toMatchObject({ code: "NETWORK", retryable: true });
    expect(f3).toHaveBeenCalledTimes(3);
  });

  it("provider errors never carry the token or the raw provider body", async () => {
    const f = jest.fn(async () => res(401, { error: { code: 190, message: "Invalid token SECRET-ACCESS-TOKEN" } }));
    const err = await new MetaWhatsAppProvider(cfg, f as any, noSleep).sendTextMessage("1", "x").catch((e) => e as WhatsAppProviderError);
    expect(err.message).not.toContain("SECRET-ACCESS-TOKEN");
    expect(JSON.stringify(err)).not.toContain("SECRET-ACCESS-TOKEN");
  });

  it("fails cleanly when Meta returns no message id", async () => {
    const p = new MetaWhatsAppProvider(cfg, (async () => res(200, {})) as any, noSleep);
    await expect(p.sendTextMessage("1", "x")).rejects.toMatchObject({ code: "NO_MESSAGE_ID" });
  });

  it("payload builders respect Meta's limits", () => {
    const long = "x".repeat(5000);
    expect(buildTextPayload("1", long).text.body.length).toBe(4096);
    const b = buildButtonsPayload("1", "b", [1, 2, 3, 4].map((i) => ({ id: `opt:${i}`, title: "t".repeat(40) })));
    expect(b.interactive.action.buttons).toHaveLength(3);
    expect(b.interactive.action.buttons[0]!.reply.title.length).toBeLessThanOrEqual(20);
    const l = buildListPayload("1", { body: "b", buttonText: "Choose an option please", rows: Array.from({ length: 15 }, (_, i) => ({ id: `opt:${i}`, title: "r".repeat(40), description: "d".repeat(100) })) });
    expect(l.interactive.action.sections[0]!.rows).toHaveLength(10);
    expect(l.interactive.action.sections[0]!.rows[0]!.title.length).toBeLessThanOrEqual(24);
    expect(l.interactive.action.sections[0]!.rows[0]!.description!.length).toBeLessThanOrEqual(72);
    expect(l.interactive.action.button.length).toBeLessThanOrEqual(20);
    const c = buildCtaUrlPayload("1", "b", "🌐 Open FarmLink and see everything", "https://x");
    expect(c.interactive.type).toBe("cta_url");
    expect(c.interactive.action.parameters.display_text.length).toBeLessThanOrEqual(20);
    expect(buildTemplatePayload("1", { name: "n", languageCode: "hi", bodyParams: ["a"] }).template.components).toBeDefined();
  });
});

describe("configuration defaults", () => {
  it("WHATSAPP_ENABLED defaults to false and needs no credentials", () => {
    const c = loadWhatsAppConfig();
    expect(c.enabled).toBe(false);
    expect(c.devAutoLinkByMobile).toBe(false);
  });
});

describe("FarmLinkUrlService", () => {
  const urls = new FarmLinkUrlService("https://app.farmlink.test/");
  it("builds contextual links from the configured base, without tokens", () => {
    expect(urls.lot("abc")).toBe("https://app.farmlink.test/lots/abc");
    expect(urls.shipment("s 1")).toBe("https://app.farmlink.test/shipments/s%201");
    expect(urls.offer("o1")).toBe("https://app.farmlink.test/trade-offers/o1");
    expect(urls.payments()).toBe(urls.dashboard()); // no payments page exists → closest page
    for (const u of [urls.dashboard(), urls.lots(), urls.offers(), urls.shipments(), urls.profile()]) expect(u).not.toMatch(/token|jwt|password|\?/i);
  });

  const appDir = path.resolve(__dirname, "../../../frontend/src/app");
  const maybe = fs.existsSync(appDir) ? it : it.skip;
  maybe("every route the service can emit exists as a real Next.js page", () => {
    const pages = new Set<string>();
    const walk = (dir: string, route: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          const seg = /^\(.*\)$/.test(e.name) ? "" : `/${e.name}`; // (group) folders don't appear in URLs
          walk(path.join(dir, e.name), route + seg);
        } else if (/^page\.(tsx|jsx|ts|js)$/.test(e.name)) pages.add(route || "/");
      }
    };
    walk(appDir, "");
    for (const p of [...FarmLinkUrlService.STATIC_PATHS, ...FarmLinkUrlService.DYNAMIC_PATHS]) expect(pages).toContain(p);
  });
});

describe("i18n catalog", () => {
  it("every message exists in English, Hindi and Hinglish with matching placeholders", () => {
    for (const k of ALL_MESSAGE_KEYS) {
      const e = rawEntry(k);
      for (const lang of ["en", "hi", "hinglish"] as const) expect(e[lang].trim().length).toBeGreaterThan(0);
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
      expect(ph(e.hi)).toBe(ph(e.en));
      expect(ph(e.hinglish)).toBe(ph(e.en));
    }
  });
  it("Hindi messages are written in Devanagari", () => {
    for (const k of ["help", "askCrop", "askQuantity", "genericError", "guestHelp", "aboutFarmLink", "guestGate"] as const) expect(rawEntry(k).hi).toMatch(/[\u0900-\u097F]/);
  });
  it("substitutes params and leaves unknown placeholders visible", () => {
    expect(t("askQuantity", "en", { crop: "Wheat" })).toContain("Wheat");
  });
});

describe("regressions found while testing", () => {
  it("a crop name never fuzzy-matches a command keyword ('rice' ≠ 'price')", () => {
    expect(parseMessage("rice").intent).toBe("UNKNOWN");
    expect(parseMessage("rice").entities.crop).toBe("rice");
    expect(parseMessage("pricee").intent).toBe("CHECK_MANDI_PRICE"); // real typos still work
  });
  it("a bare command word does not flip the reply language", () => {
    expect(detectLanguage("bhav", "en")).toBeNull();
    expect(detectLanguage("mera payment kab aayega", "en")).toBe("hinglish");
    expect(detectLanguage("आज का भाव", "en")).toBe("hi");
    expect(detectLanguage("show me my lots please", "hinglish")).toBe("en");
  });
  it("normalisation handles keycap emoji and Devanagari digits", () => {
    expect(normalizeText("2️⃣")).toBe("2");
    expect(normalizeText("२० quintal")).toBe("20 quintal");
  });
  it("location phrase stops at grade/unit words", () => {
    expect(parseMessage("wheat in Sehore grade A").entities.location).toBe("sehore");
  });
  it("replies to a bare 'bhav' are English, per the spec's example", async () => {
    const h = buildHarness();
    await h.send("bhav");
    expect(h.provider.last()!.body).toContain("Which crop's mandi price do you want?");
  });
});
