import { LowConnectivityDomainError, NotFoundError } from "../../common/errors";
import type { AuditService } from "../audit/audit.service";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { PacketHandlerRegistry } from "./packet-handler.registry";
import { isUniqueConstraintError, LowConnectivitySyncRepository } from "./low-connectivity.repository";
import { StartSessionInput, SubmitPacketInput, SyncPacketRecord, SyncPacketStatus, SyncSessionRecord, SyncSessionStatusView } from "./low-connectivity.types";
import { LowConnectivityAuthorizationService } from "./low-connectivity.authorization";

export class SyncSessionService {
  constructor(
    private readonly repo: LowConnectivitySyncRepository,
    private readonly registry: PacketHandlerRegistry,
    private readonly authorization: LowConnectivityAuthorizationService,
    private readonly auditService?: AuditService,
  ) {}

  async startSession(user: AuthenticatedUserContext, input: StartSessionInput): Promise<SyncSessionRecord> {
    const existing = await this.repo.findOpenSessionForDevice(user.id, input.deviceId);
    if (existing) return existing;
    const session = await this.repo.createSession({ userId: user.id, deviceId: input.deviceId, clientAppVersion: input.clientAppVersion ?? null, networkProfile: input.networkProfile ?? null });
    await this.auditService?.record({ actorUserId: user.id, action: "SYNC_SESSION_STARTED", entityType: "SyncSession", entityId: session.id, metadata: { deviceId: input.deviceId } });
    return session;
  }

  private async loadOwnedSession(user: AuthenticatedUserContext, publicId: string): Promise<SyncSessionRecord> {
    const session = await this.repo.findSessionByPublicId(publicId);
    if (!session) throw new NotFoundError("Sync session not found.");
    this.authorization.assertCanAccessSession(user, session);
    return session;
  }

  async getStatus(user: AuthenticatedUserContext, publicId: string): Promise<SyncSessionStatusView> {
    const session = await this.loadOwnedSession(user, publicId);
    const packets = await this.repo.listPackets(session.id);
    const counts = Object.fromEntries(["PENDING", "PROCESSING", "APPLIED", "FAILED"].map(s => [s, packets.filter(p => p.status === s).length])) as Record<SyncPacketStatus, number>;
    return { session, packets, counts };
  }

  listSessions(user: AuthenticatedUserContext): Promise<SyncSessionRecord[]> {
    return this.repo.listSessionsForUser(user.id);
  }

  async submitPacket(user: AuthenticatedUserContext, sessionPublicId: string, input: SubmitPacketInput): Promise<SyncPacketRecord> {
    const session = await this.loadOwnedSession(user, sessionPublicId);
    if (session.status !== "OPEN") throw new LowConnectivityDomainError("This sync session is no longer open.", "SYNC_SESSION_NOT_OPEN", 409);

    const existing = await this.repo.findPacketByIdempotencyKey(user.id, input.idempotencyKey);
    if (existing) return existing;

    const expected = session.lastAppliedSequence + 1;
    if (input.sequence !== expected) {
      throw new LowConnectivityDomainError(`Packet sequence is out of order. Expected sequence ${expected}.`, "SYNC_PACKET_OUT_OF_ORDER", 409);
    }

    const handler = this.registry.resolve(input.targetModule, input.action);
    if (!handler) throw new LowConnectivityDomainError(`No packet handler is registered for ${input.targetModule}/${input.action}.`, "SYNC_PACKET_HANDLER_NOT_REGISTERED", 422);

    let packet: SyncPacketRecord;
    try {
      packet = await this.repo.createPacket({ ...input, sessionId: session.id, userId: user.id });
    } catch (err) {
      if (isUniqueConstraintError(err)) throw new LowConnectivityDomainError(`Packet sequence is out of order. Expected sequence ${expected}.`, "SYNC_PACKET_OUT_OF_ORDER", 409);
      throw err;
    }

    try {
      const result = await handler.handle(user, input.payload);
      packet = await this.repo.markApplied(packet.id, result ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Packet handler failed.";
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "SYNC_PACKET_HANDLER_FAILED";
      packet = await this.repo.markFailed(packet.id, code, message);
      await this.auditService?.record({ actorUserId: user.id, action: "SYNC_PACKET_FAILED", entityType: "SyncPacket", entityId: packet.id, metadata: { sessionId: session.id, sequence: input.sequence, targetModule: input.targetModule, action: input.action, errorCode: code } });
    } finally {
      await this.repo.advanceSessionSequence(session.id, input.sequence);
    }
    return packet;
  }

  async retryPacket(user: AuthenticatedUserContext, sessionPublicId: string, packetPublicId: string): Promise<SyncPacketRecord> {
    const session = await this.loadOwnedSession(user, sessionPublicId);
    const original = await this.repo.findPacketByPublicId(packetPublicId);
    if (!original || original.sessionId !== session.id) throw new NotFoundError("Sync packet not found.");
    if (original.status !== "FAILED") throw new LowConnectivityDomainError("Only FAILED packets can be retried.", "SYNC_PACKET_NOT_RETRYABLE", 409);
    return this.submitPacket(user, sessionPublicId, {
      sequence: session.lastAppliedSequence + 1,
      idempotencyKey: `${original.idempotencyKey}:retry:${original.attempts + 1}`,
      targetModule: original.targetModule,
      action: original.action,
      payload: original.payload,
      clientCreatedAt: original.clientCreatedAt,
    });
  }

  async completeSession(user: AuthenticatedUserContext, publicId: string): Promise<SyncSessionRecord> {
    const session = await this.loadOwnedSession(user, publicId);
    if (session.status !== "OPEN") throw new LowConnectivityDomainError("Only an OPEN sync session can be completed.", "SYNC_SESSION_NOT_OPEN", 409);
    const result = await this.repo.completeSession(session.id);
    await this.auditService?.record({ actorUserId: user.id, action: "SYNC_SESSION_COMPLETED", entityType: "SyncSession", entityId: session.id });
    return result;
  }

  async abandonSession(user: AuthenticatedUserContext, publicId: string): Promise<SyncSessionRecord> {
    const session = await this.loadOwnedSession(user, publicId);
    if (session.status !== "OPEN") throw new LowConnectivityDomainError("Only an OPEN sync session can be abandoned.", "SYNC_SESSION_NOT_OPEN", 409);
    const result = await this.repo.abandonSession(session.id);
    await this.auditService?.record({ actorUserId: user.id, action: "SYNC_SESSION_ABANDONED", entityType: "SyncSession", entityId: session.id });
    return result;
  }
}
