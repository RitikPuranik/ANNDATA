import { createHmac } from "crypto";
import express, { Express } from "express";
import request from "supertest";
import { createWhatsAppModule, type WhatsAppModule } from "../../src/modules/whatsapp";
import type { WhatsAppConfig } from "../../src/modules/whatsapp/whatsapp.config";
import type {
  LinkedUserRow, MessageStatus, NewInbound, StoredInbound, WhatsAppRepository,
} from "../../src/modules/whatsapp/whatsapp.repository";
import { WhatsAppProviderError, type WhatsAppProvider } from "../../src/modules/whatsapp/providers/whatsapp-provider.interface";
import type { WhatsAppNluProvider } from "../../src/modules/whatsapp/nlu/whatsapp-nlu.provider";
import type { ConversationRecord, Lang } from "../../src/modules/whatsapp/whatsapp.types";
import { hashToken } from "../../src/modules/auth/auth.utils";

export const APP_SECRET = "test-app-secret";
export const VERIFY_TOKEN = "test-verify-token";
export const PHONE_ID = "1000001";
export const FARMER_PHONE = "919800000001";
export const OTHER_PHONE = "919800000002";

export function testConfig(over: Partial<WhatsAppConfig> = {}): WhatsAppConfig {
  return {
    enabled: true, provider: "meta", apiBaseUrl: "https://graph.example", apiVersion: "v21.0",
    accessToken: "SECRET-ACCESS-TOKEN", phoneNumberId: PHONE_ID, businessAccountId: "b1",
    webhookVerifyToken: VERIFY_TOKEN, appSecret: APP_SECRET, timeoutMs: 1000, maxRetries: 0,
    conversationTtlMinutes: 30, maxMessageAgeSeconds: 21_600, rateLimitPerMinute: 100,
    aiRateLimitPerHour: 30, matchingRateLimitPerHour: 50, aiProvider: "none", geminiApiKey: "",
    geminiModel: "m", geminiBaseUrl: "https://g.example", aiTimeoutMs: 1000, devAutoLinkByMobile: false,
    frontendUrl: "https://app.anndata.test", ...over,
  };
}

// ---------------------------------------------------------------- in-memory repo
export class InMemoryWhatsAppRepository implements WhatsAppRepository {
  links = new Map<string, { userId: string; phone: string; linkedAt: Date }>(); // by userId
  users = new Map<string, { id: string; publicId: string; fullName: string; role: string; accountStatus: string; mobile: string }>();
  codes: Array<{ userId: string; hash: string; expiresAt: Date; consumedAt: Date | null }> = [];
  conversations = new Map<string, ConversationRecord>();
  messages = new Map<string, { id: string; externalMessageId: string; phoneNumber: string; direction: "INBOUND" | "OUTBOUND"; status: MessageStatus; attempts: number; receivedAt: Date; payload: unknown; providerMessageId?: string; errorCode?: string; messageType: string; updatedAt: Date }>();
  private seq = 0;

  addUser(u: { id: string; publicId: string; fullName: string; role?: string; accountStatus?: string; mobile?: string }) {
    this.users.set(u.id, { role: "FARMER", accountStatus: "ACTIVE", mobile: "9800000001", ...u });
  }
  linkedRow(phone: string): LinkedUserRow | null {
    for (const l of this.links.values()) if (l.phone === phone) {
      const u = this.users.get(l.userId)!;
      return { userId: u.id, publicId: u.publicId, fullName: u.fullName, role: u.role, accountStatus: u.accountStatus, phoneNumber: phone };
    }
    return null;
  }
  async findLinkedUserByPhone(phone: string) { return this.linkedRow(phone); }
  async findFarmerByMobile(mobile: string) { const u = [...this.users.values()].find((x) => x.mobile === mobile); return u ?? null; }
  async upsertLink(userId: string, phone: string) {
    for (const [k, v] of this.links) if (v.phone === phone && k !== userId) this.links.delete(k);
    this.links.set(userId, { userId, phone, linkedAt: new Date() });
  }
  async deleteLinkByUser(userId: string) { return this.links.delete(userId); }
  async getLinkByUser(userId: string) { const l = this.links.get(userId); return l ? { phoneNumber: l.phone, linkedAt: l.linkedAt } : null; }
  async touchLink() { /* noop */ }
  async createLinkCode(userId: string, _d: string, hash: string, expiresAt: Date) {
    this.codes.filter((c) => c.userId === userId && !c.consumedAt).forEach((c) => (c.consumedAt = new Date()));
    this.codes.push({ userId, hash, expiresAt, consumedAt: null });
  }
  async consumeLinkCode(hash: string, now: Date) {
    const c = this.codes.find((x) => x.hash === hash && !x.consumedAt && x.expiresAt > now);
    if (!c) return null;
    c.consumedAt = now;
    return c.userId;
  }
  async getConversation(phone: string) { const c = this.conversations.get(phone); return c ? structuredClone(c) : null; }
  async createConversation(phone: string, userId: string | null, language: Lang, expiresAt: Date) {
    const c: ConversationRecord = { id: `conv-${++this.seq}`, phoneNumber: phone, userId, state: "IDLE", intent: null, entities: {}, context: {}, language, lastInboundAt: null, expiresAt };
    this.conversations.set(phone, c);
    return structuredClone(c);
  }
  async saveConversation(c: ConversationRecord) { this.conversations.set(c.phoneNumber, structuredClone(c)); }
  async insertInboundIfNew(row: NewInbound): Promise<StoredInbound | null> {
    if ([...this.messages.values()].some((m) => m.externalMessageId === row.externalMessageId)) return null;
    const id = `msg-${++this.seq}`;
    this.messages.set(id, { id, externalMessageId: row.externalMessageId, phoneNumber: row.phoneNumber, direction: "INBOUND", status: "RECEIVED", attempts: 0, receivedAt: row.receivedAt, payload: row.payload, messageType: row.messageType, updatedAt: new Date() });
    return this.stored(id);
  }
  private stored(id: string): StoredInbound { const m = this.messages.get(id)!; return { id, externalMessageId: m.externalMessageId, phoneNumber: m.phoneNumber, status: m.status, attempts: m.attempts, receivedAt: m.receivedAt, payload: m.payload }; }
  async claimInbound(id: string, staleBefore: Date) {
    const m = this.messages.get(id);
    if (!m || m.direction !== "INBOUND") return null;
    if (m.status === "RECEIVED" || (m.status === "PROCESSING" && m.updatedAt < staleBefore)) {
      m.status = "PROCESSING"; m.attempts++; m.updatedAt = new Date();
      return this.stored(id);
    }
    return null;
  }
  async markInbound(id: string, status: MessageStatus, extra: { errorCode?: string | null } = {}) {
    const m = this.messages.get(id)!; m.status = status; if (extra.errorCode) m.errorCode = extra.errorCode;
  }
  async findStuckInbound(olderThan: Date, limit: number) {
    return [...this.messages.values()].filter((m) => m.direction === "INBOUND" && (m.status === "RECEIVED" || m.status === "PROCESSING") && m.updatedAt < olderThan && m.attempts < 3).slice(0, limit).map((m) => this.stored(m.id));
  }
  async createOutboundIfNew(row: { externalMessageId: string; phoneNumber: string; messageType: string }) {
    if ([...this.messages.values()].some((m) => m.externalMessageId === row.externalMessageId)) return false;
    const id = `msg-${++this.seq}`;
    this.messages.set(id, { id, externalMessageId: row.externalMessageId, phoneNumber: row.phoneNumber, direction: "OUTBOUND", status: "QUEUED", attempts: 0, receivedAt: new Date(), payload: null, messageType: row.messageType, updatedAt: new Date() });
    return true;
  }
  async updateOutbound(key: string, patch: { status: MessageStatus; providerMessageId?: string; errorCode?: string }) {
    const m = [...this.messages.values()].find((x) => x.externalMessageId === key)!; m.status = patch.status; m.providerMessageId = patch.providerMessageId; m.errorCode = patch.errorCode;
  }
  async updateOutboundStatusByProviderId(pid: string, status: MessageStatus) {
    [...this.messages.values()].filter((m) => m.providerMessageId === pid).forEach((m) => (m.status = status));
  }
  inbound() { return [...this.messages.values()].filter((m) => m.direction === "INBOUND"); }
  outbound() { return [...this.messages.values()].filter((m) => m.direction === "OUTBOUND"); }
}

// ---------------------------------------------------------------- fake provider
export interface Sent { to: string; kind: "text" | "buttons" | "list" | "cta_url"; body: string; extra?: unknown }
export class FakeProvider implements WhatsAppProvider {
  readonly name = "fake";
  sent: Sent[] = [];
  failWith: WhatsAppProviderError | null = null;
  failInteractiveOnly = false;
  private n = 0;
  verifyWebhook(q: { mode?: string; token?: string; challenge?: string }) {
    return q.mode === "subscribe" && q.token === VERIFY_TOKEN && q.challenge !== undefined ? { ok: true as const, challenge: q.challenge } : { ok: false as const };
  }
  verifySignature(raw: Buffer, header?: string) {
    return header === `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;
  }
  private rec(to: string, kind: Sent["kind"], body: string, extra?: unknown, interactive = false) {
    if (this.failWith && (!this.failInteractiveOnly || interactive)) throw this.failWith;
    this.sent.push({ to, kind, body, extra });
    return { providerMessageId: `wamid.OUT${++this.n}` };
  }
  async sendTextMessage(to: string, text: string) { return this.rec(to, "text", text); }
  async sendInteractiveMessage(to: string, m: { type: "buttons"; body: string; buttons: unknown[] } | { type: "cta_url"; body: string; displayText: string; url: string }) {
    return m.type === "buttons" ? this.rec(to, "buttons", m.body, m.buttons, true) : this.rec(to, "cta_url", m.body, { text: m.displayText, url: m.url }, true);
  }
  async sendListMessage(to: string, m: { body: string; rows: unknown[] }) { return this.rec(to, "list", m.body, m.rows, true); }
  async sendTemplateMessage(): Promise<never> { throw new Error("unused"); }
  async downloadMedia(): Promise<never> { throw new Error("unused"); }
  texts(to = FARMER_PHONE) { return this.sent.filter((s) => s.to === to).map((s) => s.body); }
  last(to = FARMER_PHONE) { return this.sent.filter((s) => s.to === to).at(-1); }
  all(to = FARMER_PHONE) { return this.texts(to).join("\n---\n"); }
}

// ---------------------------------------------------------------- fake Anndata services
const crops = [
  { id: "crop-wheat", name: "Wheat", category: "Cereal", translations: { hi: "गेहूं" } },
  { id: "crop-soy", name: "Soybean", category: "Oilseed", translations: { hi: "सोयाबीन" } },
  { id: "crop-rice", name: "Rice", category: "Cereal", translations: { hi: "चावल" } },
];
const farm = { id: "farm-1", village: "Kharpa", state: { name: "Madhya Pradesh" }, district: { name: "Sehore" }, taluka: { name: "Ashta" } };

export interface Fakes {
  lots: Array<Record<string, any>>;
  createLotCalls: number;
  publishCalls: number;
  qualityCalls: number;
  matchesCalls: number;
  /** Guest (lot-less) searches of open buyer demand: the arguments each call received. */
  openDemandCalls: Array<Record<string, any>>;
  offerCalls: Array<Record<string, any>>;
  acceptCalls: string[];
  farms: any[];
  farmerCrops: any[];
  offers: any[];
  ownOfferIds: string[];
  payments: { items: any[]; records: any[] } ;
  shipments: any[];
  mandiRows: any[];
  matches: any[];
  failures: Partial<Record<"matches" | "payments" | "shipments" | "offers" | "mandi" | "createLot" | "accept", any>>;
  auditActions: string[];
  serviceUsers: string[]; // every user id services were called with
}

export interface Harness {
  app: Express;
  module: WhatsAppModule;
  repo: InMemoryWhatsAppRepository;
  provider: FakeProvider;
  fakes: Fakes;
  send(text: string, opts?: { from?: string; id?: string; ts?: number }): Promise<request.Response>;
  sendRaw(payload: unknown, opts?: { signature?: string | null }): Promise<request.Response>;
  sendAction(actionId: string, opts?: { from?: string; id?: string }): Promise<request.Response>;
  sendLocation(lat: number, lon: number, opts?: { from?: string }): Promise<request.Response>;
  conv(phone?: string): ConversationRecord | undefined;
}

let idCounter = 0;
export const waPayload = (messages: unknown[], phoneId = PHONE_ID) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "biz", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneId }, contacts: [{ wa_id: FARMER_PHONE, profile: { name: "Ram" } }], messages } }] }],
});
export const textMsg = (body: string, from = FARMER_PHONE, id = `wamid.IN${++idCounter}`, ts = Math.floor(Date.now() / 1000)) => ({ id, from, timestamp: String(ts), type: "text", text: { body } });
export const sign = (raw: string) => `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;

export function buildHarness(opts: { config?: Partial<WhatsAppConfig>; nlu?: WhatsAppNluProvider; linked?: boolean } = {}): Harness {
  const repo = new InMemoryWhatsAppRepository();
  repo.addUser({ id: "u-1", publicId: "pub-1", fullName: "Ram Farmer" });
  repo.addUser({ id: "u-2", publicId: "pub-2", fullName: "Other Farmer", mobile: "9800000002" });
  if (opts.linked !== false) repo.links.set("u-1", { userId: "u-1", phone: FARMER_PHONE, linkedAt: new Date() });
  const provider = new FakeProvider();

  const f: Fakes = {
    lots: [], createLotCalls: 0, publishCalls: 0, qualityCalls: 0, matchesCalls: 0, openDemandCalls: [], offerCalls: [], acceptCalls: [],
    farms: [farm], farmerCrops: [{ farmId: "farm-1", cropId: "crop-wheat" }, { farmId: "farm-1", cropId: "crop-soy" }],
    offers: [], ownOfferIds: [], payments: { items: [], records: [] }, shipments: [], mandiRows: [], matches: [],
    failures: {}, auditActions: [], serviceUsers: [],
  };
  const today = new Date();
  f.mandiRows = [
    { mandiId: "m1", observedDate: today, modalPrice: 2450, minPrice: 2300, maxPrice: 2520, arrivalQuantity: 10, mandi: { id: "m1", publicId: "pm1", name: "Sehore Mandi", district: "Sehore", state: "Madhya Pradesh", latitude: 23.2, longitude: 77.08 } },
    { mandiId: "m2", observedDate: today, modalPrice: 2430, minPrice: 2280, maxPrice: 2500, arrivalQuantity: 10, mandi: { id: "m2", publicId: "pm2", name: "Bhopal Mandi", district: "Bhopal", state: "Madhya Pradesh", latitude: 23.25, longitude: 77.4 } },
  ];
  f.matches = [
    { buyer: { organizationName: "ABC Foods" }, demand: { publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", requiredQuantity: 30, quantityUnit: "QTL", state: "Madhya Pradesh", district: "Indore" }, matchScore: 90 },
    { buyer: { organizationName: "XYZ Agro" }, demand: { publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", requiredQuantity: 50, quantityUnit: "QTL", state: "Madhya Pradesh", district: "Bhopal" }, matchScore: 80 },
    { buyer: { organizationName: "PQR Traders" }, demand: { publicId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", requiredQuantity: 25, quantityUnit: "QTL", state: "Madhya Pradesh", district: "Dewas" }, matchScore: 70 },
  ];
  const track = (u: { id: string }) => { f.serviceUsers.push(u.id); };
  const guard = (k: keyof Fakes["failures"]) => { if (f.failures[k]) throw f.failures[k]; };
  const mkLot = (o: Record<string, any>) => ({ publicId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${f.lots.length + 1}`, lotNumber: "L1", crop: { id: "crop-wheat", name: "Wheat" }, farm: { id: "farm-1" }, quantity: { value: 20, unit: "QTL", quantityKg: 2000 }, availableQuantity: { value: 20, unit: "QTL" }, origin: { village: "Kharpa", taluka: "Ashta", district: "Sehore", state: "Madhya Pradesh" }, status: "DRAFT", ...o });

  const lotsService: any = {
    createLot: async (u: any, input: any) => { track(u); guard("createLot"); f.createLotCalls++; const lot = mkLot({ crop: crops.find((c) => c.id === input.cropId), quantity: { value: input.quantity, unit: input.unit, quantityKg: input.quantity * 100 }, availableQuantity: { value: input.quantity, unit: input.unit } }); f.lots.push(lot); return lot; },
    publishLot: async (u: any, id: string) => { track(u); f.publishCalls++; const l = f.lots.find((x) => x.publicId === id)!; l.status = "AVAILABLE"; return l; },
    listMyLots: async (u: any) => { track(u); return { items: f.lots.filter((l) => !l.ownerId || l.ownerId === u.id), total: f.lots.length }; },
    getLot: async (u: any, id: string) => { track(u); const l = f.lots.find((x) => x.publicId === id); if (!l) { const e: any = new Error("Lot not found"); e.code = "LOT_NOT_FOUND"; e.statusCode = 404; throw e; } return l; },
  };
  const qualityService: any = {
    createAssessment: async (u: any) => { track(u); f.qualityCalls++; return {}; },
    getLotQualitySummary: async () => ({ hasAssessment: false, currentAssessment: null }),
  };
  const matchingService: any = {
    matches: async (u: any) => { track(u); guard("matches"); f.matchesCalls++; return { matches: f.matches }; },
    // Public, account-less search: deliberately takes NO user (so it can never be tracked as one).
    searchOpenDemand: async (input: any) => { guard("matches"); f.openDemandCalls.push(input); return { matches: f.matches }; },
    offers: async (u: any) => { track(u); guard("offers"); return f.offers; },
    accept: async (u: any, id: string) => { track(u); guard("accept"); f.acceptCalls.push(id); },
    offerAction: async (u: any) => { track(u); },
    counter: async (u: any) => { track(u); },
    createOffer: async (u: any, input: any) => { track(u); f.offerCalls.push(input); return {}; },
  };
  const paymentService: any = {
    list: async (u: any) => { track(u); guard("payments"); return f.payments; },
    listPayments: async () => ({ items: f.payments.records, total: f.payments.records.length }),
  };
  const shipmentService: any = { listShipments: async (u: any) => { track(u); guard("shipments"); return { items: f.shipments, total: f.shipments.length, page: 1, limit: 20 }; } };
  const refData: any = { listCrops: async () => crops };
  const audit: any = { record: async (e: any) => { f.auditActions.push(e.action); } };
  const prisma: any = {
    cropLot: { groupBy: async () => [] },
    mandi: {
      findMany: async () => [{ state: "Madhya Pradesh", district: "Sehore" }, { state: "Madhya Pradesh", district: "Bhopal" }, { state: "Madhya Pradesh", district: "Indore" }],
      findFirst: async () => null,
    },
    mandiPrice: {
      groupBy: async () => { guard("mandi"); return f.mandiRows.map((r) => ({ mandiId: r.mandiId, _max: { observedDate: r.observedDate } })); },
      findMany: async () => f.mandiRows,
    },
    tradeOffer: {
      findMany: async (args: any) => {
        const w = args?.where ?? {};
        if (w.publicId) return f.offers.filter((o) => w.publicId.in.includes(o.publicId)).map((o) => ({ publicId: o.publicId, initiatorId: f.ownOfferIds.includes(o.publicId) ? "u-1" : "buyer-user" }));
        return (f.payments.items as any[]).map((p) => ({ id: p.tradeOfferId, buyer: { organizationName: "ABC Foods" }, lot: { crop: { name: "Wheat" } } }));
      },
    },
  };
  const farmsRepo: any = { findManyByFarmerProfileId: async () => f.farms };
  const cropRepo: any = { findManyByFarmerProfileId: async () => f.farmerCrops };
  const resolver: any = { ensure: async (userId: string) => ({ id: `profile-${userId}`, userId }) };

  const module = createWhatsAppModule({
    prisma, auditService: audit, authRepository: {} as any, referenceDataService: refData, farmsRepository: farmsRepo,
    farmerCropRepository: cropRepo, farmerProfileResolver: resolver, lotsService, qualityService,
    buyerMatchingService: matchingService, paymentService, shipmentService,
    config: testConfig(opts.config), provider, repository: repo, nluProvider: opts.nlu, processInline: true,
  });
  const app = express();
  app.use(module.webhookRouter);

  const post = (payload: unknown, signature?: string | null) => {
    const raw = JSON.stringify(payload);
    const r = request(app).post("/api/whatsapp/webhook").set("Content-Type", "application/json");
    if (signature !== null) r.set("X-Hub-Signature-256", signature ?? sign(raw));
    return r.send(raw);
  };
  return {
    app, module, repo, provider, fakes: f,
    send: (text, o = {}) => post(waPayload([textMsg(text, o.from, o.id, o.ts)])),
    sendRaw: (payload, o = {}) => post(payload, o.signature),
    sendAction: (actionId, o = {}) => post(waPayload([{ id: o.id ?? `wamid.IN${++idCounter}`, from: o.from ?? FARMER_PHONE, timestamp: String(Math.floor(Date.now() / 1000)), type: "interactive", interactive: { type: "list_reply", list_reply: { id: actionId, title: "x" } } }])),
    sendLocation: (lat, lon, o = {}) => post(waPayload([{ id: `wamid.IN${++idCounter}`, from: o.from ?? FARMER_PHONE, timestamp: String(Math.floor(Date.now() / 1000)), type: "location", location: { latitude: lat, longitude: lon } }])),
    conv: (phone = FARMER_PHONE) => repo.conversations.get(phone),
  };
}

export { hashToken };
