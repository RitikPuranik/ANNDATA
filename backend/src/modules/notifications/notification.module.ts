import type { PrismaClient } from "@prisma/client";
import type { Router } from "express";
import type { AuditService } from "../audit/audit.service";
import type { AuthRepository } from "../auth/auth.repository";
import type { EmailService } from "./email/email.service";
import type { WhatsAppProvider } from "../whatsapp/providers/whatsapp-provider.interface";
import { NotificationAnnouncementService } from "./notification-announcement.service";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { NotificationEventPublisher, type NotificationHook } from "./notification-event.publisher";
import { NotificationPreferenceRepository } from "./notification-preference.repository";
import { NotificationPreferenceService } from "./notification-preference.service";
import { NotificationAuthorizationService } from "./notification.authorization";
import { NotificationRepository } from "./notification.repository";
import { createNotificationRouter } from "./notification.routes";
import { NotificationService } from "./notification.service";
import { EmailNotificationProvider } from "./providers/email.provider";
import { InAppNotificationProvider } from "./providers/in-app.provider";
import type { NotificationProvider } from "./providers/notification-provider.interface";
import { UnavailableSmsNotificationProvider } from "./providers/sms.provider";
import { WhatsAppNotificationProvider } from "./providers/whatsapp.provider";

export interface NotificationModuleDeps {
  prisma: PrismaClient;
  auditService: AuditService;
  authRepository: AuthRepository;
  emailService: EmailService;
  /** The SAME WhatsAppProvider instance the WhatsApp module already
   * constructed (WhatsAppModule.provider) — Section 39: never a second
   * WhatsApp client. Omit only in tests. */
  whatsAppProvider: WhatsAppProvider;
  // Overridable seam for tests.
  providers?: NotificationProvider[];
}

export interface NotificationModule {
  router: Router;
  service: NotificationService;
  preferenceService: NotificationPreferenceService;
  deliveryService: NotificationDeliveryService;
  announcementService: NotificationAnnouncementService;
  repository: NotificationRepository;
  /** The hook other modules' services call `setNotificationHook(hook)`
   * with (Section 22 — see notification-event.publisher.ts's own doc for
   * which modules are wired in today). */
  publisher: NotificationHook;
}

/**
 * Composition root for Module 22 — Notifications & Alerts. Receives
 * Anndata's already-constructed cross-cutting services (prisma, audit,
 * auth, email, the WhatsApp transport) and wires the notification layer on
 * top of them; no business logic belonging to another module is
 * re-implemented here (Section 1/56).
 */
export function createNotificationModule(deps: NotificationModuleDeps): NotificationModule {
  const repository = new NotificationRepository(deps.prisma);
  const preferenceRepository = new NotificationPreferenceRepository(deps.prisma);
  const preferenceService = new NotificationPreferenceService(preferenceRepository);
  const authorization = new NotificationAuthorizationService();

  const providers: NotificationProvider[] =
    deps.providers ?? [
      new InAppNotificationProvider(),
      new WhatsAppNotificationProvider(deps.prisma, deps.whatsAppProvider),
      new EmailNotificationProvider(deps.prisma, deps.emailService),
      new UnavailableSmsNotificationProvider(),
    ];
  const deliveryService = new NotificationDeliveryService(repository, providers);

  const service = new NotificationService(deps.prisma, repository, preferenceService, deliveryService, authorization);
  const announcementService = new NotificationAnnouncementService(deps.prisma, service, deps.auditService);
  const publisher = new NotificationEventPublisher(service);

  const router = createNotificationRouter(service, preferenceService, announcementService, deps.authRepository, deps.auditService);

  return { router, service, preferenceService, deliveryService, announcementService, repository, publisher };
}

export type { NotificationHook, DomainNotificationEvent } from "./notification-event.publisher";
