import { ALL_MESSAGE_KEYS, t } from "../../src/modules/whatsapp/whatsapp-i18n";
import { buildHarness, FARMER_PHONE, OTHER_PHONE, textMsg, waPayload, type Harness } from "./harness";

/** A harness in which NO number is linked: every sender is a guest. */
const guest = (over: Parameters<typeof buildHarness>[0] = {}) => buildHarness({ ...over, linked: false });
const say = async (h: Harness, ...texts: string[]) => { for (const x of texts) await h.send(x); };
const rows = (h: Harness) => (h.provider.last()!.extra as Array<{ title: string }>).map((r) => r.title);
const cta = (h: Harness, phone = FARMER_PHONE) => {
  const m = h.provider.last(phone)!;
  expect(m.kind).toBe("cta_url");
  return { body: m.body, text: (m.extra as any).text as string, url: (m.extra as any).url as string };
};
const REGISTER_URL = "https://app.farmlink.test/register";

/** buyer → wheat → 20 quintal → Sehore → Grade A, i.e. the guided flow, ending in results. */
const guidedSearch = async (h: Harness) => {
  await say(h, "buyer", "wheat", "20 quintal", "Sehore");
  await h.sendAction("opt:1"); // Grade A
};

describe("guest: what works without registering", () => {
  it("G1. the first 'hi' gets the guest menu (not a dead end) and creates a conversation tied to no account", async () => {
    const h = guest();
    await h.send("hi");
    const out = h.provider.all();
    expect(out).toContain("No registration needed");
    expect(out).toContain('"buyer"');
    expect(out).toContain('"bhav"');
    expect(out).toContain("how it works");
    expect(out).toContain("register");
    expect(out).not.toContain("Farmer Assistant");
    expect(h.conv()!.userId).toBeNull();
    expect(h.fakes.serviceUsers).toHaveLength(0);
  });

  it("G2. 'buyer' shows a crop menu that is NOT personalised to any farmer", async () => {
    const h = guest();
    await h.send("buyer");
    expect(h.provider.last()!.kind).toBe("list");
    // The linked farmer's own crops (wheat, soybean) would be first; a guest gets the neutral A→Z order.
    expect(rows(h)).toEqual(["Rice", "Soybean", "Wheat", "Other"]);
    expect(h.conv()!.state).toBe("COLLECTING_CROP");
  });

  it("G3. guided flow collects crop, quantity, location and grade, then searches OPEN DEMAND (no lot, no farm)", async () => {
    const h = guest();
    await say(h, "buyer", "wheat");
    expect(h.provider.last()!.body).toContain("How much Wheat");
    await h.send("20 quintal");
    expect(h.provider.last()!.body).toContain("Where is your Wheat");
    await h.send("Sehore");
    expect(h.provider.last()!.body).toContain("What is the quality?");
    await h.sendAction("opt:1"); // Grade A

    const out = h.provider.last()!;
    expect(out.body).toContain("3 relevant buyer(s) for your Wheat");
    expect(out.body).toContain("ABC Foods");
    expect(out.body).toContain("XYZ Agro");
    expect(out.body).toContain("Mandi reference: ₹2,440/Q");
    expect(out.body).toContain("not guaranteed");
    expect(out.body).toContain("continue on FarmLink"); // the guest note
    expect(out.kind).toBe("buttons");

    // The search used the public, lot-less path with what the guest typed ...
    expect(h.fakes.openDemandCalls).toHaveLength(1);
    expect(h.fakes.openDemandCalls[0]).toMatchObject({ cropId: "crop-wheat", quantity: 20, unit: "QTL", state: "Madhya Pradesh", district: "Sehore" });
    // ... the unverified self-declared grade is not fed into scoring ...
    expect(JSON.stringify(h.fakes.openDemandCalls[0])).not.toMatch(/grade/i);
    // ... and nothing account-owned was touched.
    expect(h.fakes.matchesCalls).toBe(0);
    expect(h.fakes.createLotCalls).toBe(0);
    expect(h.fakes.publishCalls).toBe(0);
    expect(h.fakes.qualityCalls).toBe(0);
    expect(h.fakes.offerCalls).toHaveLength(0);
    expect(h.fakes.serviceUsers).toHaveLength(0);
  });

  it("G4. one natural sentence goes straight to buyers", async () => {
    const h = guest();
    await h.send("mere paas 20 quintal gehu hai Sehore mein grade A");
    expect(h.provider.last()!.body).toContain("ABC Foods");
    expect(h.fakes.openDemandCalls[0]).toMatchObject({ cropId: "crop-wheat", quantity: 20, district: "Sehore" });
  });

  it("G5. buyer details work for a guest, and say plainly that demand is not an offer", async () => {
    const h = guest();
    await guidedSearch(h);
    await h.sendAction("opt:1"); // Buyer details
    expect(h.provider.last()!.kind).toBe("list");
    await h.sendAction("opt:1"); // first buyer
    const out = h.provider.last()!.body;
    expect(out).toContain("ABC Foods");
    expect(out).toContain("Indore");
    expect(out).toContain("not an offer or a guarantee");
  });

  it("G6. 'Request offer' hits the sign-up gate and sends nothing", async () => {
    const h = guest();
    await guidedSearch(h);
    await h.sendAction("opt:2"); // Request offer
    const c = cta(h);
    expect(c.body).toContain("To send an offer, you need a FarmLink account");
    expect(c.text).toBe("Continue on FarmLink");
    expect(c.url).toBe(REGISTER_URL);
    expect(h.fakes.offerCalls).toHaveLength(0);
    expect(h.fakes.serviceUsers).toHaveLength(0);
  });

  it("G6b. 'Request offer' from the buyer-details screen is gated the same way", async () => {
    const h = guest();
    await guidedSearch(h);
    await h.sendAction("opt:1");
    await h.sendAction("opt:2"); // buyer #2
    await h.sendAction("opt:1"); // details → "Request offer"
    // (opt:1 on the details screen is the offer button)
    const c = cta(h);
    expect(c.body).toContain("you need a FarmLink account");
    expect(c.url).toBe(REGISTER_URL);
    expect(h.fakes.offerCalls).toHaveLength(0);
  });

  it("G7. no matching buyers → honest message + sign-up link, not a fake list", async () => {
    const h = guest();
    h.fakes.matches = [];
    await guidedSearch(h);
    const c = cta(h);
    expect(c.body).toContain("No matching buyers right now for Wheat");
    expect(c.url).toBe(REGISTER_URL);
  });

  it("G8. a search failure gives a plain retry message, never technical detail", async () => {
    const h = guest();
    h.fakes.failures.matches = new Error("Prisma P1001 can't reach database");
    await guidedSearch(h);
    expect(h.provider.last()!.body).toContain("couldn't complete that right now");
    expect(h.provider.last()!.body).not.toMatch(/prisma|P1001/i);
  });
});

describe("guest: mandi prices", () => {
  it("G9. 'bhav' → crop → asks for a district (a guest has no farms) → prices; the button leads to sign-up", async () => {
    const h = guest();
    await say(h, "bhav", "wheat");
    expect(h.provider.last()!.body).toContain("Which district or mandi area?");
    await h.send("Sehore");
    const c = cta(h);
    expect(c.body).toContain("Wheat Mandi Prices");
    expect(c.body).toContain("Sehore Mandi");
    expect(c.body).toContain("Modal: ₹2,450/Q");
    expect(c.text).toBe("Continue on FarmLink");
    expect(c.url).toBe(REGISTER_URL);
    expect(h.fakes.serviceUsers).toHaveLength(0);
  });

  it("G10. 'gehu ka bhav Bhopal mein' prefers the named district", async () => {
    const h = guest();
    await h.send("gehu ka bhav Bhopal mein");
    const out = h.provider.last()!.body;
    expect(out.indexOf("Bhopal Mandi")).toBeGreaterThan(-1);
    expect(out.indexOf("Bhopal Mandi")).toBeLessThan(out.indexOf("Sehore Mandi"));
  });

  it("G11. a shared location finds the nearest mandis", async () => {
    const h = guest();
    await h.sendLocation(23.25, 77.4); // right at Bhopal
    expect(h.conv()!.state).toBe("COLLECTING_CROP");
    await h.send("wheat");
    const out = h.provider.last()!.body;
    expect(out.indexOf("Bhopal Mandi")).toBeLessThan(out.indexOf("Sehore Mandi"));
  });
});

describe("guest: account-owned features are gated with 'Continue on FarmLink'", () => {
  const gated: Array<[string, string]> = [
    ["my lot", "manage your lots"],
    ["offers", "see your offers"],
    ["payment", "see your payments"],
    ["shipment", "track your shipments"],
    ["where is my shipment", "track your shipments"],
    ["add my farm", "manage your farms and crops"],
    ["warehouse", "do this"],
  ];
  it.each(gated)("G12. '%s' → gate (%s), no private data, no service call", async (text, what) => {
    const h = guest();
    // Someone else's data exists in the system; none of it may surface.
    h.fakes.lots.push({ publicId: "lot-secret", crop: { id: "crop-wheat", name: "Wheat" }, status: "AVAILABLE", quantity: { value: 20, unit: "QTL", quantityKg: 2000 }, availableQuantity: { value: 20, unit: "QTL" }, origin: {}, });
    h.fakes.offers.push({ publicId: "off-secret", status: "SENT", quantity: 20, quantityUnit: "QTL", offeredPrice: 2480, totalValue: 49600, buyer: { organizationName: "Secret Buyer" }, lot: { publicId: "lot-secret", crop: { name: "Wheat" } } });
    h.fakes.shipments.push({ publicId: "ship-secret" });
    await h.send(text);
    const c = cta(h);
    expect(c.body).toContain(`To ${what}, you need a FarmLink account`);
    expect(c.text).toBe("Continue on FarmLink");
    expect(c.url).toBe(REGISTER_URL);
    expect(h.provider.all()).not.toMatch(/lot-secret|off-secret|ship-secret|Secret Buyer/);
    expect(h.fakes.serviceUsers).toHaveLength(0);
    expect(h.conv()!.state).toBe("IDLE");
  });

  it("G12b. the gate answers in the guest's own language", async () => {
    const h = guest();
    await h.send("mera maal kaha hai");
    expect(cta(h).body).toContain("apni shipment track karne ke liye aapko FarmLink account chahiye");
    const h2 = guest();
    await h2.send("मेरा पेमेंट");
    expect(cta(h2).body).toContain("अपने भुगतान देखने के लिए");
  });

  it("G13. 'register' / 'website' send the sign-up link", async () => {
    const h = guest();
    await h.send("register");
    let c = cta(h);
    expect(c.body).toContain("Register (free) or log in");
    expect(c.url).toBe(REGISTER_URL);
    await h.send("website link bhejo");
    c = cta(h);
    expect(c.url).toBe(REGISTER_URL);
  });

  it("G14. private commands interrupt a half-finished search cleanly", async () => {
    const h = guest();
    await say(h, "buyer", "wheat"); // now COLLECTING_QUANTITY
    await h.send("payment");
    expect(cta(h).body).toContain("see your payments");
    expect(h.conv()!.state).toBe("IDLE");
  });
});

describe("guest: 'how it works' and language", () => {
  it("G15. 'how it works' explains the process, is honest about buyers, and links to sign-up", async () => {
    const h = guest();
    await h.send("how does farmlink work?");
    const c = cta(h);
    expect(c.body).toContain("How FarmLink works");
    expect(c.body).toContain("No buyer is guaranteed to purchase");
    expect(c.body).toContain("The buyer pays you directly");
    expect(c.text).toBe("Continue on FarmLink");
    expect(c.url).toBe(REGISTER_URL);
  });

  it("G16. Hinglish and Hindi questions are answered in the same language", async () => {
    const h = guest();
    await h.send("farmlink kaise kaam karta hai");
    expect(cta(h).body).toContain("FarmLink kaise kaam karta hai");
    const h2 = guest();
    await h2.send("नमस्ते");
    expect(h2.provider.all()).toContain("FarmLink में आपका स्वागत है");
  });

  it("G17. a linked farmer can ask too — and gets the dashboard, not sign-up", async () => {
    const h = buildHarness();
    await h.send("how it works");
    const c = cta(h);
    expect(c.body).toContain("How FarmLink works");
    expect(c.text).toBe("🌐 Open FarmLink");
    expect(c.url).toBe("https://app.farmlink.test/dashboard");
  });

  it("G18. gibberish gets a friendly guest fallback with the menu hint, never silence", async () => {
    const h = guest();
    await h.send("asdf qwer zxcv");
    const c = cta(h);
    expect(c.body).toContain("no registration needed");
    expect(c.body).toContain('"help"');
  });

  it("G19. images / voice get the guest text-only hint", async () => {
    const h = guest();
    await h.sendRaw(waPayload([{ id: "wamid.IMG1", from: FARMER_PHONE, timestamp: String(Math.floor(Date.now() / 1000)), type: "image", image: { id: "m1" } }]));
    expect(h.provider.last()!.body).toContain("I can currently process text messages");
    expect(h.provider.last()!.body).toContain("how it works");
    expect(h.provider.last()!.body).not.toContain("my lot");
  });
});

describe("guest: limits and identity boundaries", () => {
  it("G20. buyer searches are rate-limited PER NUMBER (a guest has no account to hold accountable)", async () => {
    const h = guest({ config: { matchingRateLimitPerHour: 1 } });
    await h.send("I have 20 quintal wheat in Sehore, grade A");
    expect(h.provider.last()!.body).toContain("ABC Foods");
    await h.send("I have 20 quintal wheat in Sehore, grade A");
    expect(h.provider.last()!.body).toContain("reached the limit");
    expect(h.fakes.openDemandCalls).toHaveLength(1);
    // another number has its own budget
    await h.send("I have 20 quintal wheat in Sehore, grade A", { from: OTHER_PHONE });
    expect(h.provider.last(OTHER_PHONE)!.body).toContain("ABC Foods");
  });

  it("G21. stale linked-only state can never be answered by a guest ('yes' does not create a lot)", async () => {
    const h = guest();
    await h.send("hi");
    // Simulate a corrupt/stale conversation: a guest sitting in a lot-confirmation step.
    const conv = h.repo.conversations.get(FARMER_PHONE)!;
    Object.assign(conv, { state: "AWAITING_CONFIRMATION", intent: "FIND_BUYER", entities: { crop: { id: "crop-wheat", name: "Wheat" }, quantity: 20, unit: "QTL", farmId: "farm-1" }, context: { confirm: { kind: "CREATE_LOT" } } });
    await h.send("yes");
    expect(h.fakes.createLotCalls).toBe(0);
    expect(h.fakes.publishCalls).toBe(0);
    expect(h.fakes.serviceUsers).toHaveLength(0);
    expect(h.conv()!.state).toBe("IDLE");
    expect(h.provider.last()!.body).toContain("no registration needed");
  });

  it("G22. unlinking mid-flow: the old lot confirmation is dropped, 'yes' creates nothing", async () => {
    const h = buildHarness(); // linked farmer
    await h.send("I have 20 quintal wheat in Sehore, grade A");
    expect(h.conv()!.state).toBe("AWAITING_CONFIRMATION");
    h.repo.links.clear(); // the farmer unlinks on the website
    await h.send("yes");
    expect(h.fakes.createLotCalls).toBe(0);
    expect(h.conv()!.userId).toBeNull();
    expect(h.conv()!.state).toBe("IDLE");
    expect(h.provider.last()!.body).toContain("no registration needed");
  });

  it("G23. linking after a guest search starts fresh: guest search state does not leak into the farmer session", async () => {
    const h = guest();
    await say(h, "buyer", "wheat"); // guest is COLLECTING_QUANTITY
    expect(h.conv()!.state).toBe("COLLECTING_QUANTITY");
    const { code } = await h.module.farmerService.issueLinkCode("u-1", {});
    await h.send(`LINK ${code}`);
    expect(h.provider.last()!.body).toContain("Done!");
    await h.send("20 quintal"); // would have been the answer to the guest's question
    expect(h.conv()!.userId).toBe("u-1");
    expect(h.conv()!.state).not.toBe("COLLECTING_LOCATION");
    expect(h.provider.last()!.body).not.toContain("Where is your");
  });

  it("G24. a linked farmer never uses the guest search path", async () => {
    const h = buildHarness();
    await h.send("mere paas 20 quintal gehu hai Sehore mein grade A");
    await h.send("yes"); // confirm lot
    expect(h.fakes.matchesCalls).toBe(1);
    expect(h.fakes.openDemandCalls).toHaveLength(0);
  });
});

describe("guest: message catalog", () => {
  const langs = ["en", "hi", "hinglish"] as const;

  it("G25. every message that is sent as a button-card fits WhatsApp's 1024-char body limit, in every language", () => {
    for (const lang of langs) {
      const bodies = [
        t("aboutFarmLink", lang),
        t("guestWebsite", lang),
        t("guestFallback", lang),
        t("guestNoBuyers", lang, { crop: "Groundnut" }),
        ...(["gateLots", "gateOffers", "gatePayments", "gateShipments", "gateSendOffer", "gateFarms", "gateGeneric"] as const).map((w) => t("guestGate", lang, { what: t(w, lang) })),
      ];
      for (const b of bodies) expect(b.length).toBeLessThanOrEqual(1024);
    }
  });

  it("G26. every button / CTA label fits WhatsApp's 20-character limit in every language (else Meta truncates it)", () => {
    const labels = ALL_MESSAGE_KEYS.filter((k) => /^(cta|btn)/.test(k) || ["yes", "no", "useLot", "newLot", "other", "gradeA", "gradeB", "gradeUnknown"].includes(k));
    expect(labels).toEqual(expect.arrayContaining(["ctaContinue", "ctaOpen", "btnOffer"]));
    for (const k of labels) for (const lang of langs) expect([...t(k, lang)].length).toBeLessThanOrEqual(20);
  });

  it("G27. guest messages exist in all three languages, and Hindi is Devanagari", () => {
    for (const k of ["guestHelp", "aboutFarmLink", "guestGate", "guestBuyersNote", "guestNoBuyers", "guestWebsite", "guestFallback", "guestTextOnly"] as const) {
      expect(ALL_MESSAGE_KEYS).toContain(k);
      expect(t(k, "hi", { what: "x", crop: "x" })).toMatch(/[\u0900-\u097F]/);
    }
  });
});

// Kept so the helper import stays meaningful if a scenario needs a raw text payload.
void textMsg;
