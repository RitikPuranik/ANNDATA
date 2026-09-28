import { Prisma, PrismaClient } from "@prisma/client";
import { SyncPacketRecord, SyncPacketStatus, SyncSessionRecord, SyncSessionStatus } from "./low-connectivity.types";

export function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export interface CreateSessionData {
  userId: string;
  deviceId: string;
  clientAppVersion: string | null;
  networkProfile: string | null;
}

export interface CreatePacketData {
  sessionId: string;
  userId: string;
  sequence: number;
  idempotencyKey: string;
  targetModule: string;
  action: string;
  payload: unknown;
  clientCreatedAt: Date;
}

export interface LowConnectivitySyncRepository {
  createSession(data: CreateSessionData): Promise<SyncSessionRecord>;
  findOpenSessionForDevice(userId: string, deviceId: string): Promise<SyncSessionRecord | null>;
  findSessionByPublicId(publicId: string): Promise<SyncSessionRecord | null>;
  listSessionsForUser(userId: string): Promise<SyncSessionRecord[]>;
  completeSession(id: string): Promise<SyncSessionRecord>;
  abandonSession(id: string): Promise<SyncSessionRecord>;
  advanceSessionSequence(id: string, sequence: number): Promise<SyncSessionRecord | null>;
  createPacket(data: CreatePacketData): Promise<SyncPacketRecord>;
  findPacketByIdempotencyKey(userId: string, key: string): Promise<SyncPacketRecord | null>;
  findPacketByPublicId(publicId: string): Promise<SyncPacketRecord | null>;
  listPackets(sessionId: string): Promise<SyncPacketRecord[]>;
  markApplied(id: string, resultSummary: unknown): Promise<SyncPacketRecord>;
  markFailed(id: string, errorCode: string, errorMessage: string): Promise<SyncPacketRecord>;
}

function mapSession(row: any): SyncSessionRecord {
  return { ...row } as SyncSessionRecord;
}
function mapPacket(row: any): SyncPacketRecord {
  return { ...row } as SyncPacketRecord;
}

export class PrismaLowConnectivitySyncRepository implements LowConnectivitySyncRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSession(data: CreateSessionData): Promise<SyncSessionRecord> {
    return mapSession(await this.prisma.syncSession.create({ data }));
  }

  async findOpenSessionForDevice(userId: string, deviceId: string): Promise<SyncSessionRecord | null> {
    return mapSessionOrNull(await this.prisma.syncSession.findFirst({ where: { userId, deviceId, status: "OPEN" }, orderBy: { createdAt: "desc" } }));
  }

  async findSessionByPublicId(publicId: string): Promise<SyncSessionRecord | null> {
    return mapSessionOrNull(await this.prisma.syncSession.findUnique({ where: { publicId } }));
  }

  async listSessionsForUser(userId: string): Promise<SyncSessionRecord[]> {
    return (await this.prisma.syncSession.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })).map(mapSession);
  }

  async completeSession(id: string): Promise<SyncSessionRecord> {
    return mapSession(await this.prisma.syncSession.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } }));
  }

  async abandonSession(id: string): Promise<SyncSessionRecord> {
    return mapSession(await this.prisma.syncSession.update({ where: { id }, data: { status: "ABANDONED", completedAt: new Date() } }));
  }

  async advanceSessionSequence(id: string, sequence: number): Promise<SyncSessionRecord | null> {
    const result = await this.prisma.syncSession.updateMany({
      where: { id, lastAppliedSequence: sequence - 1 },
      data: { lastAppliedSequence: sequence },
    });
    if (result.count === 0) return null;
    return this.findSessionById(id);
  }

  private async findSessionById(id: string): Promise<SyncSessionRecord | null> {
    return mapSessionOrNull(await this.prisma.syncSession.findUnique({ where: { id } }));
  }

  async createPacket(data: CreatePacketData): Promise<SyncPacketRecord> {
    const payload = data.payload as Prisma.InputJsonValue;
    return mapPacket(await this.prisma.syncPacket.create({
      data: { ...data, payload, status: "PROCESSING" },
    }));
  }

  async findPacketByIdempotencyKey(userId: string, key: string): Promise<SyncPacketRecord | null> {
    return mapPacketOrNull(await this.prisma.syncPacket.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } }));
  }

  async findPacketByPublicId(publicId: string): Promise<SyncPacketRecord | null> {
    return mapPacketOrNull(await this.prisma.syncPacket.findUnique({ where: { publicId } }));
  }

  async listPackets(sessionId: string): Promise<SyncPacketRecord[]> {
    return (await this.prisma.syncPacket.findMany({ where: { sessionId }, orderBy: { sequence: "asc" } })).map(mapPacket);
  }

  async markApplied(id: string, resultSummary: unknown): Promise<SyncPacketRecord> {
    return mapPacket(await this.prisma.syncPacket.update({ where: { id }, data: { status: "APPLIED", resultSummary: resultSummary == null ? Prisma.JsonNull : resultSummary as Prisma.InputJsonValue, appliedAt: new Date() } }));
  }

  async markFailed(id: string, errorCode: string, errorMessage: string): Promise<SyncPacketRecord> {
    return mapPacket(await this.prisma.syncPacket.update({ where: { id }, data: { status: "FAILED", errorCode, errorMessage } }));
  }
}

function mapSessionOrNull(row: any): SyncSessionRecord | null { return row ? mapSession(row) : null; }
function mapPacketOrNull(row: any): SyncPacketRecord | null { return row ? mapPacket(row) : null; }
