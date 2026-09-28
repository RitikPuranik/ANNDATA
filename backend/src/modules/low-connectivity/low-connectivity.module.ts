import type { PrismaClient } from "@prisma/client";
import type { Router } from "express";
import type { AuditService } from "../audit/audit.service";
import type { AuthRepository } from "../auth/auth.repository";
import { LowConnectivityAuthorizationService } from "./low-connectivity.authorization";
import { createLowConnectivityRouter } from "./low-connectivity.routes";
import { PacketHandler, PacketHandlerRegistry, registerBuiltInHandlers } from "./packet-handler.registry";
import { PreloadBundleService } from "./preload-bundle.service";
import { PrismaLowConnectivitySyncRepository } from "./low-connectivity.repository";
import { SyncSessionService } from "./sync-session.service";
import { logger } from "../../config/logger";

export interface LowConnectivityModuleDeps { prisma: PrismaClient; authRepository: AuthRepository; auditService: AuditService; handlers?: PacketHandler[]; }
export interface LowConnectivityModule { router: Router; syncSessionService: SyncSessionService; preloadBundleService: PreloadBundleService; registry: PacketHandlerRegistry; }

export function createLowConnectivityModule(deps: LowConnectivityModuleDeps): LowConnectivityModule {
  const repository = new PrismaLowConnectivitySyncRepository(deps.prisma);
  const registry = new PacketHandlerRegistry();
  registerBuiltInHandlers(registry, payload => logger.info({ payload }));
  for (const handler of deps.handlers ?? []) registry.register(handler);
  const authorization = new LowConnectivityAuthorizationService();
  const syncSessionService = new SyncSessionService(repository, registry, authorization, deps.auditService);
  const preloadBundleService = new PreloadBundleService(deps.prisma);
  const router = createLowConnectivityRouter(syncSessionService, preloadBundleService, deps.authRepository, deps.auditService);
  return { router, syncSessionService, preloadBundleService, registry };
}
