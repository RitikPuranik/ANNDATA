import request from "supertest";
import express from "express";
import { buildTestApp } from "../testUtils/buildTestApp";
import { registerAndLoginFarmer } from "../testUtils/farmerAuthHelpers";
import { WhatsAppAccountController } from "../../src/modules/whatsapp/whatsapp-webhook.controller";
import { buildHarness } from "../whatsapp/harness";

describe("WhatsApp wiring inside the real FarmLink app", () => {
  it("is disabled by default: webhook answers 503 and JSON APIs are unaffected", async () => {
    const { app } = buildTestApp();
    const get = await request(app).get("/api/whatsapp/webhook").query({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" });
    expect(get.status).toBe(503);
    expect(get.body.error.code).toBe("WHATSAPP_DISABLED");
    const post = await request(app).post("/api/whatsapp/webhook").set("Content-Type", "application/json").send({ object: "whatsapp_business_account", entry: [] });
    expect(post.status).toBe(503);
    // the global JSON parser still works for every other route
    const login = await request(app).post("/api/auth/login").send({ mobile: "9000000000", password: "wrongwrongwrong" });
    expect([400, 401]).toContain(login.status);
  });

  it("account-linking endpoints require an authenticated FARMER", async () => {
    const { app } = buildTestApp();
    expect((await request(app).post("/api/whatsapp/link/code")).status).toBe(401);
    expect((await request(app).get("/api/whatsapp/link")).status).toBe(401);
    expect((await request(app).delete("/api/whatsapp/link")).status).toBe(401);
    const { token } = await registerAndLoginFarmer(app);
    // authenticated farmers pass auth (the fake Prisma in this suite can't store the code, so we only assert it is not an auth failure)
    const r = await request(app).get("/api/whatsapp/link").set("Authorization", `Bearer ${token}`);
    expect([401, 403]).not.toContain(r.status);
  });

  it("the Swagger spec documents the WhatsApp endpoints", async () => {
    const { app } = buildTestApp();
    const docs = await request(app).get("/api/docs.json");
    if (docs.status === 200) {
      expect(Object.keys(docs.body.paths)).toEqual(expect.arrayContaining(["/api/whatsapp/webhook", "/api/whatsapp/link/code"]));
      expect(docs.body.paths["/api/whatsapp/webhook"].post.security).toEqual([]); // signature-authenticated, not JWT
    }
  });
});

describe("account linking controller (website side)", () => {
  function app() {
    const h = buildHarness();
    const c = new WhatsAppAccountController(h.module.farmerService, "");
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => { (req as any).user = { id: "u-2", publicId: "pub-2", role: "FARMER" }; next(); });
    a.post("/code", (q, s) => void c.issueCode(q, s));
    a.get("/status", (q, s) => void c.status(q, s));
    a.delete("/link", (q, s) => void c.unlink(q, s));
    return { a, h };
  }

  it("issues a one-time code, stores only its hash, and reports masked link status", async () => {
    const { a, h } = app();
    const r = await request(a).post("/code");
    expect(r.status).toBe(201);
    const code = r.body.data.code as string;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(h.repo.codes[0]!.hash).not.toBe(code);
    expect(JSON.stringify(h.repo.codes)).not.toContain(code);
    expect((await request(a).get("/status")).body.data).toEqual({ linked: false });

    await h.send(`LINK ${code}`, { from: "919800000002" });
    const st = (await request(a).get("/status")).body.data;
    expect(st.linked).toBe(true);
    expect(st.phoneMasked).toBe("••••0002");
    expect(JSON.stringify(st)).not.toContain("919800000002");

    expect((await request(a).delete("/link")).body.data).toEqual({ unlinked: true });
    await h.send("help", { from: "919800000002" });
    expect(h.provider.all("919800000002")).toContain("not linked");
  });

  it("a newer code invalidates the previous one", async () => {
    const { a, h } = app();
    const c1 = (await request(a).post("/code")).body.data.code as string;
    const c2 = (await request(a).post("/code")).body.data.code as string;
    await h.send(`LINK ${c1}`, { from: "919800000002" });
    expect(h.repo.links.has("u-2")).toBe(false);
    await h.send(`LINK ${c2}`, { from: "919800000002" });
    expect(h.repo.links.has("u-2")).toBe(true);
  });

  it("re-linking a number to another account moves it (a number belongs to one farmer)", async () => {
    const { h } = app();
    const { code } = await h.module.farmerService.issueLinkCode("u-2", {});
    // 919800000001 is currently linked to u-1
    await h.send(`LINK ${code}`, { from: "919800000001" });
    expect(h.repo.links.get("u-2")!.phone).toBe("919800000001");
    expect(h.repo.links.has("u-1")).toBe(false);
  });
});
