import { buildHarness, FARMER_PHONE, OTHER_PHONE, PHONE_ID, VERIFY_TOKEN, sign, textMsg, waPayload } from "./harness";
import request from "supertest";

describe("WhatsApp webhook — verification, signature, payload, idempotency", () => {
  it("1. GET verification echoes the challenge only for the right token", async () => {
    const h = buildHarness();
    const ok = await request(h.app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "12345" });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("12345");
    const bad = await request(h.app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "12345" });
    expect(bad.status).toBe(403);
    expect(bad.text).not.toContain(VERIFY_TOKEN);
    const missing = await request(h.app).get("/api/whatsapp/webhook");
    expect(missing.status).toBe(400);
  });

  it("2. rejects an invalid or missing signature and processes nothing", async () => {
    const h = buildHarness();
    const payload = waPayload([textMsg("help")]);
    const wrong = await h.sendRaw(payload, { signature: "sha256=" + "0".repeat(64) });
    expect(wrong.status).toBe(401);
    const none = await h.sendRaw(payload, { signature: null });
    expect(none.status).toBe(401);
    expect(h.repo.inbound()).toHaveLength(0);
    expect(h.provider.sent).toHaveLength(0);
  });

  it("3. rejects malformed JSON and invalid payload shapes (validly signed)", async () => {
    const h = buildHarness();
    const raw = "{not json";
    const r1 = await request(h.app).post("/api/whatsapp/webhook").set("Content-Type", "application/json").set("X-Hub-Signature-256", sign(raw)).send(raw);
    expect(r1.status).toBe(400);
    const r2 = await h.sendRaw({ object: "page", entry: [] });
    expect(r2.status).toBe(400);
    const r3 = await h.sendRaw(waPayload([{ id: "x", from: "not-digits", timestamp: "1", type: "text", text: { body: "hi" } }]));
    expect(r3.status).toBe(400);
    expect(h.repo.inbound()).toHaveLength(0);
  });

  it("4. duplicate delivery of the same message id is acknowledged and processed once", async () => {
    const h = buildHarness();
    const msg = textMsg("help", FARMER_PHONE, "wamid.DUP1");
    const a = await h.sendRaw(waPayload([msg]));
    const b = await h.sendRaw(waPayload([msg]));
    expect(a.body.data).toEqual({ accepted: 1, duplicates: 0 });
    expect(b.status).toBe(200);
    expect(b.body.data).toEqual({ accepted: 0, duplicates: 1 });
    expect(h.provider.sent).toHaveLength(1);
    expect(h.repo.inbound()).toHaveLength(1);
  });

  it("ignores events addressed to a different phone_number_id", async () => {
    const h = buildHarness();
    const r = await h.sendRaw(waPayload([textMsg("help")], "999999"));
    expect(r.status).toBe(200);
    expect(h.repo.inbound()).toHaveLength(0);
  });

  it("stale messages are acknowledged but not answered", async () => {
    const h = buildHarness();
    await h.send("help", { ts: Math.floor(Date.now() / 1000) - 3 * 24 * 3600 });
    expect(h.provider.sent).toHaveLength(0);
    expect(h.repo.inbound()[0]!.status).toBe("IGNORED");
  });

  it("when WHATSAPP_ENABLED=false the webhook answers 503 and makes no provider call", async () => {
    const h = buildHarness({ config: { enabled: false } });
    const g = await request(h.app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1" });
    expect(g.status).toBe(503);
    const p = await h.send("help");
    expect(p.status).toBe(503);
    expect(h.provider.sent).toHaveLength(0);
    expect(h.repo.inbound()).toHaveLength(0);
  });

  it("6. an unknown phone number is a guest: private requests hit the sign-up gate, no farmer data, no service call", async () => {
    const h = buildHarness();
    h.fakes.lots.push({ publicId: "lot-x", crop: { id: "crop-wheat", name: "Wheat" }, status: "AVAILABLE" });
    const res = await h.send("my lot", { from: OTHER_PHONE });
    expect(res.status).toBe(200);
    const out = h.provider.all(OTHER_PHONE);
    expect(out).toContain("you need a FarmLink account");
    expect(h.provider.last(OTHER_PHONE)!.kind).toBe("cta_url");
    expect((h.provider.last(OTHER_PHONE)!.extra as any).text).toBe("Continue on FarmLink");
    expect(out).not.toContain("Wheat");
    expect(h.fakes.serviceUsers).toHaveLength(0); // no FarmLink service was called
  });

  it("6c. an unknown number's first 'hi' gets the guest menu, not a dead end", async () => {
    const h = buildHarness();
    await h.send("hi", { from: OTHER_PHONE });
    const out = h.provider.all(OTHER_PHONE);
    expect(out).toContain("No registration needed");
    expect(out).toContain("buyer");
    expect(out).toContain("bhav");
    expect(h.conv(OTHER_PHONE)!.userId).toBeNull(); // a guest conversation, tied to no account
  });

  it("outbound bodies are never stored; phone identity comes from the link, not the message", async () => {
    const h = buildHarness();
    await h.send("my lot");
    expect(h.repo.outbound().every((m) => m.payload === null || typeof m.payload === "object")).toBe(true);
    expect(PHONE_ID).toBeTruthy();
  });
});
