import { Prisma, type PrismaClient } from "@prisma/client";
import type { CollectedEntities, ConversationContext, ConversationRecord, ConversationState, Intent, Lang } from "./whatsapp.types";

export interface LinkedUserRow {
  userId: string;
  publicId: string;
  fullName: string;
  role: string;
  accountStatus: string;
  phoneNumber: string;
}

export type MessageStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "IGNORED" | "FAILED" | "QUEUED" | "SENT" | "DELIVERED" | "READ";

export interface StoredInbound {
  id: string;
  externalMessageId: string;
  phoneNumber: string;
  status: MessageStatus;
  attempts: number;
  receivedAt: Date;
  payload: unknown;
}

export interface NewInbound {
  externalMessageId: string;
  phoneNumber: string;
  messageType: string;
  text: string | null;
  payload: Prisma.InputJsonValue;
  receivedAt: Date;
}

/** Persistence port for the assistant. Prisma implementation below; tests use an in-memory one. */
export interface WhatsAppRepository {
  findLinkedUserByPhone(phone: string): Promise<LinkedUserRow | null>;
  findFarmerByMobile(mobile: string): Promise<{ id: string; publicId: string; fullName: string; role: string; accountStatus: string } | null>;
  upsertLink(userId: string, phone: string): Promise<void>;
  deleteLinkByUser(userId: string): Promise<boolean>;
  getLinkByUser(userId: string): Promise<{ phoneNumber: string; linkedAt: Date } | null>;
  touchLink(phone: string): Promise<void>;

  createLinkCode(userId: string, destination: string, codeHash: string, expiresAt: Date): Promise<void>;
  /** Atomically consumes a valid, unexpired code. Returns the owning userId or null. */
  consumeLinkCode(codeHash: string, now: Date): Promise<string | null>;

  getConversation(phone: string): Promise<ConversationRecord | null>;
  createConversation(phone: string, userId: string | null, language: Lang, expiresAt: Date): Promise<ConversationRecord>;
  saveConversation(conv: ConversationRecord): Promise<void>;

  /** Returns null when the externalMessageId already exists (duplicate delivery). */
  insertInboundIfNew(row: NewInbound): Promise<StoredInbound | null>;
  /** Atomic RECEIVED→PROCESSING claim (also reclaims PROCESSING rows stale since `staleBefore`). */
  claimInbound(id: string, staleBefore: Date): Promise<StoredInbound | null>;
  markInbound(id: string, status: MessageStatus, extra?: { userId?: string | null; conversationId?: string | null; errorCode?: string | null }): Promise<void>;
  findStuckInbound(olderThan: Date, limit: number): Promise<StoredInbound[]>;

  /** Returns false when this outbound key already exists (already sent / being sent). */
  createOutboundIfNew(row: { externalMessageId: string; phoneNumber: string; conversationId: string | null; userId: string | null; messageType: string }): Promise<boolean>;
  updateOutbound(externalMessageId: string, patch: { status: MessageStatus; providerMessageId?: string; errorCode?: string }): Promise<void>;
  updateOutboundStatusByProviderId(providerMessageId: string, status: MessageStatus): Promise<void>;
}

export class PrismaWhatsAppRepository implements WhatsAppRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findLinkedUserByPhone(phone: string): Promise<LinkedUserRow | null> {
    const link = await this.prisma.whatsAppLink.findUnique({
      where: { phoneNumber: phone },
      include: { user: { select: { id: true, publicId: true, fullName: true, role: true, accountStatus: true } } },
    });
    if (!link) return null;
    return {
      userId: link.user.id,
      publicId: link.user.publicId,
      fullName: link.user.fullName,
      role: link.user.role,
      accountStatus: link.user.accountStatus,
      phoneNumber: link.phoneNumber,
    };
  }

  async findFarmerByMobile(mobile: string) {
    const u = await this.prisma.user.findUnique({
      where: { mobile },
      select: { id: true, publicId: true, fullName: true, role: true, accountStatus: true },
    });
    return u ? { ...u } : null;
  }

  async upsertLink(userId: string, phone: string): Promise<void> {
    await this.prisma.$transaction([
      // A WhatsApp number belongs to exactly one account: re-linking moves it.
      this.prisma.whatsAppLink.deleteMany({ where: { phoneNumber: phone, NOT: { userId } } }),
      this.prisma.whatsAppLink.upsert({
        where: { userId },
        create: { userId, phoneNumber: phone },
        update: { phoneNumber: phone, linkedAt: new Date() },
      }),
    ]);
  }

  async deleteLinkByUser(userId: string): Promise<boolean> {
    const r = await this.prisma.whatsAppLink.deleteMany({ where: { userId } });
    return r.count > 0;
  }

  async getLinkByUser(userId: string) {
    const l = await this.prisma.whatsAppLink.findUnique({ where: { userId }, select: { phoneNumber: true, linkedAt: true } });
    return l ?? null;
  }

  async touchLink(phone: string): Promise<void> {
    await this.prisma.whatsAppLink.updateMany({ where: { phoneNumber: phone }, data: { lastInboundAt: new Date() } });
  }

  async createLinkCode(userId: string, destination: string, codeHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.$transaction([
      // Only the latest code is valid.
      this.prisma.otpChallenge.updateMany({ where: { userId, purpose: "WHATSAPP_LINK", consumedAt: null }, data: { consumedAt: new Date() } }),
      this.prisma.otpChallenge.create({ data: { userId, destination, purpose: "WHATSAPP_LINK", codeHash, expiresAt } }),
    ]);
  }

  async consumeLinkCode(codeHash: string, now: Date): Promise<string | null> {
    const candidate = await this.prisma.otpChallenge.findFirst({
      where: { purpose: "WHATSAPP_LINK", codeHash, consumedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true },
    });
    if (!candidate?.userId) return null;
    // Compare-and-set so two concurrent LINK messages can't both win.
    const r = await this.prisma.otpChallenge.updateMany({ where: { id: candidate.id, consumedAt: null }, data: { consumedAt: now } });
    return r.count === 1 ? candidate.userId : null;
  }

  private toConversation(row: {
    id: string; phoneNumber: string; userId: string | null; state: string; intent: string | null;
    collectedEntities: Prisma.JsonValue; context: Prisma.JsonValue; language: string; lastInboundAt: Date | null; expiresAt: Date;
  }): ConversationRecord {
    return {
      id: row.id,
      phoneNumber: row.phoneNumber,
      userId: row.userId,
      state: row.state as ConversationState,
      intent: (row.intent as Intent | null) ?? null,
      entities: (row.collectedEntities ?? {}) as CollectedEntities,
      context: (row.context ?? {}) as ConversationContext,
      language: (["en", "hi", "hinglish"].includes(row.language) ? row.language : "hinglish") as Lang,
      lastInboundAt: row.lastInboundAt,
      expiresAt: row.expiresAt,
    };
  }

  async getConversation(phone: string): Promise<ConversationRecord | null> {
    const row = await this.prisma.whatsAppConversation.findUnique({ where: { phoneNumber: phone } });
    return row ? this.toConversation(row) : null;
  }

  async createConversation(phone: string, userId: string | null, language: Lang, expiresAt: Date): Promise<ConversationRecord> {
    // upsert so two first messages racing from a new number can't collide on the UNIQUE phone.
    const row = await this.prisma.whatsAppConversation.upsert({
      where: { phoneNumber: phone },
      create: { phoneNumber: phone, userId, language, expiresAt },
      update: {},
    });
    return this.toConversation(row);
  }

  async saveConversation(c: ConversationRecord): Promise<void> {
    await this.prisma.whatsAppConversation.update({
      where: { id: c.id },
      data: {
        userId: c.userId,
        state: c.state,
        intent: c.intent,
        collectedEntities: c.entities as unknown as Prisma.InputJsonValue,
        context: c.context as unknown as Prisma.InputJsonValue,
        language: c.language,
        lastInboundAt: c.lastInboundAt,
        expiresAt: c.expiresAt,
      },
    });
  }

  private toStored(r: { id: string; externalMessageId: string; phoneNumber: string; status: string; attempts: number; receivedAt: Date; payload: Prisma.JsonValue | null }): StoredInbound {
    return { id: r.id, externalMessageId: r.externalMessageId, phoneNumber: r.phoneNumber, status: r.status as MessageStatus, attempts: r.attempts, receivedAt: r.receivedAt, payload: r.payload };
  }

  async insertInboundIfNew(row: NewInbound): Promise<StoredInbound | null> {
    try {
      const r = await this.prisma.whatsAppMessage.create({
        data: {
          externalMessageId: row.externalMessageId,
          phoneNumber: row.phoneNumber,
          direction: "INBOUND",
          messageType: row.messageType,
          text: row.text,
          payload: row.payload,
          status: "RECEIVED",
          receivedAt: row.receivedAt,
        },
      });
      return this.toStored(r);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
      throw err;
    }
  }

  async claimInbound(id: string, staleBefore: Date): Promise<StoredInbound | null> {
    const r = await this.prisma.whatsAppMessage.updateMany({
      where: {
        id,
        direction: "INBOUND",
        OR: [{ status: "RECEIVED" }, { status: "PROCESSING", updatedAt: { lt: staleBefore } }],
      },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (r.count !== 1) return null;
    const row = await this.prisma.whatsAppMessage.findUnique({ where: { id } });
    return row ? this.toStored(row) : null;
  }

  async markInbound(id: string, status: MessageStatus, extra: { userId?: string | null; conversationId?: string | null; errorCode?: string | null } = {}): Promise<void> {
    await this.prisma.whatsAppMessage.update({
      where: { id },
      data: {
        status,
        processedAt: new Date(),
        ...(extra.userId !== undefined ? { userId: extra.userId } : {}),
        ...(extra.conversationId !== undefined ? { conversationId: extra.conversationId } : {}),
        ...(extra.errorCode !== undefined ? { errorCode: extra.errorCode } : {}),
      },
    });
  }

  async findStuckInbound(olderThan: Date, limit: number): Promise<StoredInbound[]> {
    const rows = await this.prisma.whatsAppMessage.findMany({
      where: { direction: "INBOUND", attempts: { lt: 3 }, OR: [{ status: "RECEIVED" }, { status: "PROCESSING" }], updatedAt: { lt: olderThan } },
      orderBy: { receivedAt: "asc" },
      take: limit,
    });
    return rows.map((r) => this.toStored(r));
  }

  async createOutboundIfNew(row: { externalMessageId: string; phoneNumber: string; conversationId: string | null; userId: string | null; messageType: string }): Promise<boolean> {
    try {
      await this.prisma.whatsAppMessage.create({
        data: { ...row, direction: "OUTBOUND", status: "QUEUED", payload: { kind: row.messageType } },
      });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
      throw err;
    }
  }

  async updateOutbound(externalMessageId: string, patch: { status: MessageStatus; providerMessageId?: string; errorCode?: string }): Promise<void> {
    await this.prisma.whatsAppMessage.update({
      where: { externalMessageId },
      data: { status: patch.status, providerMessageId: patch.providerMessageId, errorCode: patch.errorCode, processedAt: new Date() },
    });
  }

  async updateOutboundStatusByProviderId(providerMessageId: string, status: MessageStatus): Promise<void> {
    await this.prisma.whatsAppMessage.updateMany({ where: { providerMessageId, direction: "OUTBOUND" }, data: { status } });
  }
}
