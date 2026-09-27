// Module 23 (Part 1) — Low-Connectivity Offline Sync & Preloading.
//
// A packet never contains business logic itself — it just names
// (targetModule, action) plus a small JSON payload. This registry is the
// single place that maps that pair onto the code that actually applies it.
// This keeps SyncSessionService completely decoupled from every other
// module: today it ships with only the two generic, self-contained
// handlers below (registerBuiltInHandlers), and other modules can later
// register their own handler for, say, ("QUALITY", "SUBMIT_ASSESSMENT")
// from app.ts — passed in via LowConnectivityModuleDeps.handlers — without
// this file, or anything else in this module, ever being touched again.
// This is exactly how the "don't disturb other parts" constraint on this
// change is satisfied while still leaving the door open for other modules
// to plug into offline forwarding later.

import { AuthenticatedUserContext } from "../auth/auth.types";

export interface PacketHandler {
  /** Matched against SyncPacket.targetModule (e.g. "QUALITY", "LOTS"). */
  targetModule: string;
  /** Matched against SyncPacket.action (e.g. "SUBMIT_ASSESSMENT"). */
  action: string;
  /**
   * Applies one packet's payload as the authenticated owner of the sync
   * session (never a different user — SyncSessionService always calls
   * this with the same `user` that owns the session). May return a small
   * JSON-serializable summary that gets stored on the packet's
   * `resultSummary` and echoed back to the client (e.g. the server-side id
   * created for a client-generated draft) so the client can reconcile its
   * own local queue. Throwing marks the packet FAILED — see
   * SyncSessionService.submitPacket.
   */
  handle(user: AuthenticatedUserContext, payload: unknown): Promise<Record<string, unknown> | void>;
}

function registryKey(targetModule: string, action: string): string {
  return `${targetModule.trim().toUpperCase()}::${action.trim().toUpperCase()}`;
}

export class PacketHandlerRegistry {
  private readonly handlers = new Map<string, PacketHandler>();

  /** Throws on a duplicate (targetModule, action) registration — a silent
   * overwrite here would mean two modules unknowingly fighting over the
   * same packet type, which must fail loudly at startup, not at runtime
   * on whichever packet happens to arrive first. */
  register(handler: PacketHandler): void {
    const key = registryKey(handler.targetModule, handler.action);
    if (this.handlers.has(key)) {
      throw new Error(
        `A packet handler is already registered for ${handler.targetModule}/${handler.action}.`,
      );
    }
    this.handlers.set(key, handler);
  }

  resolve(targetModule: string, action: string): PacketHandler | undefined {
    return this.handlers.get(registryKey(targetModule, action));
  }

  /** For diagnostics/admin tooling only — e.g. an endpoint that reports
   * which offline actions this deployment currently supports. */
  listRegisteredActions(): Array<{ targetModule: string; action: string }> {
    return Array.from(this.handlers.values()).map((h) => ({ targetModule: h.targetModule, action: h.action }));
  }
}

/**
 * Two generic, dependency-free handlers so the sync engine is genuinely
 * useful out of the box even before any other module registers a handler
 * of its own:
 *
 * - SYSTEM/PING: a cheap end-to-end connectivity/roundtrip check the
 *   client can push through its normal offline queue to confirm ordering
 *   is working, without needing any business data.
 * - DIAGNOSTICS/CLIENT_LOG: lets a field device forward small connectivity
 *   diagnostics (signal drops, retry counts, battery-saver mode, etc.)
 *   through the exact same reliable, ordered channel as everything else,
 *   which is often the only channel available on a 2G link. It is
 *   deliberately not persisted to its own table (out of scope here) —
 *   it is written to the structured application log, which is enough for
 *   Module 25 (Analytics & Impact Dashboard, still planned) or ad-hoc
 *   support triage to pick up later without inventing a table this change
 *   would otherwise have to guess the shape of.
 */
export function registerBuiltInHandlers(registry: PacketHandlerRegistry, log: (payload: unknown) => void): void {
  registry.register({
    targetModule: "SYSTEM",
    action: "PING",
    async handle() {
      return { pong: true, serverTime: new Date().toISOString() };
    },
  });

  registry.register({
    targetModule: "DIAGNOSTICS",
    action: "CLIENT_LOG",
    async handle(user, payload) {
      log({ userId: user.id, clientDiagnostics: payload });
      return { received: true };
    },
  });
}
