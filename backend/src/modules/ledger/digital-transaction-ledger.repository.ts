import { LedgerDirection, LedgerEventType, LedgerSourceModule, Prisma, PrismaClient } from "@prisma/client";
import { LedgerEntryRow } from "./digital-transaction-ledger.types";

export function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export interface CreateLedgerEntryData {
  transactionId: string;
  tradeId: string | null;
  lotId: string | null;
  farmerId: string | null;
  buyerId: string | null;
  eventType: LedgerEventType;
  direction: LedgerDirection;
  amount: number;
  currency: string;
  sourceModule: LedgerSourceModule;
  sourceEntityId: string | null;
  sourceEventId: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  reversalOfEntryId: string | null;
  createdByUserId: string | null;
}

export interface LedgerListFilters {
  /** Resolved server-side to whichever farmer/buyer ids the caller's role
   * is entitled to see — same "narrow the same column" convention as
   * PaymentObligationListFilters.visibleBuyerIds. */
  transactionId?: string;
  tradeId?: string;
  farmerId?: string;
  buyerId?: string;
  page: number;
  limit: number;
}

export interface LedgerPage {
  items: LedgerEntryRow[];
  total: number;
}

export interface DigitalTransactionLedgerRepository {
  /** Step: "Idempotency" — the DB uniqueness constraint on
   * (sourceModule, sourceEntityId, sourceEventId, eventType) is the real
   * protection; this returns the existing row on a P2002 conflict instead
   * of throwing, so a replayed upstream event is a silent no-op. */
  create(data: CreateLedgerEntryData, tx?: Prisma.TransactionClient): Promise<{ entry: LedgerEntryRow; deduped: boolean }>;
  createMany(entries: CreateLedgerEntryData[], tx: Prisma.TransactionClient): Promise<{ entries: LedgerEntryRow[]; deduped: boolean[] }>;
  findById(id: string): Promise<LedgerEntryRow | null>;
  findByPublicId(publicId: string): Promise<LedgerEntryRow | null>;
  findExisting(
    sourceModule: LedgerSourceModule,
    sourceEntityId: string | null,
    sourceEventId: string | null,
    eventType: LedgerEventType,
  ): Promise<LedgerEntryRow | null>;
  findReversalsOf(entryId: string): Promise<LedgerEntryRow[]>;
  listByTransactionId(transactionId: string): Promise<LedgerEntryRow[]>;
  list(filters: LedgerListFilters): Promise<LedgerPage>;
}

export class PrismaDigitalTransactionLedgerRepository implements DigitalTransactionLedgerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private toCreateData(data: CreateLedgerEntryData): Prisma.DigitalTransactionLedgerUncheckedCreateInput {
    return {
      transactionId: data.transactionId,
      tradeId: data.tradeId,
      lotId: data.lotId,
      farmerId: data.farmerId,
      buyerId: data.buyerId,
      eventType: data.eventType,
      direction: data.direction,
      amount: data.amount,
      currency: data.currency,
      sourceModule: data.sourceModule,
      sourceEntityId: data.sourceEntityId,
      sourceEventId: data.sourceEventId,
      description: data.description,
      metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      reversalOfEntryId: data.reversalOfEntryId,
      createdByUserId: data.createdByUserId,
    };
  }

  async create(data: CreateLedgerEntryData, tx?: Prisma.TransactionClient): Promise<{ entry: LedgerEntryRow; deduped: boolean }> {
    const client = tx ?? this.prisma;
    try {
      const entry = await client.digitalTransactionLedger.create({ data: this.toCreateData(data) });
      return { entry, deduped: false };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const existing = await client.digitalTransactionLedger.findUnique({
          where: {
            ledger_idempotency_key: {
              sourceModule: data.sourceModule,
              sourceEntityId: data.sourceEntityId,
              sourceEventId: data.sourceEventId,
              eventType: data.eventType,
            },
          },
        });
        if (existing) return { entry: existing, deduped: true };
      }
      throw err;
    }
  }

  async createMany(entries: CreateLedgerEntryData[], tx: Prisma.TransactionClient): Promise<{ entries: LedgerEntryRow[]; deduped: boolean[] }> {
    const results: LedgerEntryRow[] = [];
    const dedupedFlags: boolean[] = [];
    for (const data of entries) {
      const { entry, deduped } = await this.create(data, tx);
      results.push(entry);
      dedupedFlags.push(deduped);
    }
    return { entries: results, deduped: dedupedFlags };
  }

  findById(id: string) {
    return this.prisma.digitalTransactionLedger.findUnique({ where: { id } });
  }

  findByPublicId(publicId: string) {
    return this.prisma.digitalTransactionLedger.findUnique({ where: { publicId } });
  }

  findExisting(sourceModule: LedgerSourceModule, sourceEntityId: string | null, sourceEventId: string | null, eventType: LedgerEventType) {
    return this.prisma.digitalTransactionLedger.findUnique({
      where: { ledger_idempotency_key: { sourceModule, sourceEntityId, sourceEventId, eventType } },
    });
  }

  findReversalsOf(entryId: string) {
    return this.prisma.digitalTransactionLedger.findMany({ where: { reversalOfEntryId: entryId } });
  }

  listByTransactionId(transactionId: string) {
    return this.prisma.digitalTransactionLedger.findMany({
      where: { transactionId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async list(filters: LedgerListFilters): Promise<LedgerPage> {
    const where: Prisma.DigitalTransactionLedgerWhereInput = {
      ...(filters.transactionId ? { transactionId: filters.transactionId } : {}),
      ...(filters.tradeId ? { tradeId: filters.tradeId } : {}),
      ...(filters.farmerId ? { farmerId: filters.farmerId } : {}),
      ...(filters.buyerId ? { buyerId: filters.buyerId } : {}),
    };
    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
      this.prisma.digitalTransactionLedger.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: filters.limit,
      }),
      this.prisma.digitalTransactionLedger.count({ where }),
    ]);
    return { items, total };
  }
}
