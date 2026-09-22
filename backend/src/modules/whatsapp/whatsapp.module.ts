import type { PrismaClient } from "@prisma/client";
import type { Router } from "express";
import type { AuditService } from "../audit/audit.service";
import type { AuthRepository } from "../auth/auth.repository";
import type { BuyerMatchingService } from "../buyer-matching/buyer-matching.service";
import type { FarmerCropRepository } from "../crops/farmer-crop.repository";
import type { FarmerProfileResolver } from "../farmers/farmer-profile.resolver";
import type { FarmsRepository } from "../farms/farms.repository";
import type { LotsService } from "../lots/lots.service";
import { MarketIntelligenceRepository } from "../market-intelligence/market-intelligence.repository";
import type { PaymentService } from "../payments/payment.service";
import type { QualityService } from "../quality/quality.service";
import type { ReferenceDataService } from "../reference-data/reference-data.service";
import type { ShipmentService } from "../shipments/shipment.service";
import { loadWhatsAppConfig, type WhatsAppConfig } from "./whatsapp.config";
import { PrismaWhatsAppRepository, type WhatsAppRepository } from "./whatsapp.repository";
import { createWhatsAppAccountRouter, createWhatsAppWebhookRouter } from "./whatsapp.routes";
import { GeminiNluProvider, UnavailableNluProvider, type WhatsAppNluProvider } from "./nlu/whatsapp-nlu.provider";
import { WhatsAppIntentService } from "./nlu/whatsapp-intent.service";
import { MetaWhatsAppProvider } from "./providers/meta-whatsapp.provider";
import { UnavailableSpeechToTextProvider, type SpeechToTextProvider } from "./providers/speech-to-text.provider";
import { WhatsAppProviderError, type WhatsAppProvider } from "./providers/whatsapp-provider.interface";
import { WhatsAppBuyerAssistantService } from "./whatsapp-buyer-assistant.service";
import { WhatsAppCatalogService } from "./whatsapp-catalog.service";
import { WhatsAppCommandRouter } from "./whatsapp-command-router.service";
import { WhatsAppConversationService } from "./whatsapp-conversation.service";
import { AnndataUrlService } from "./whatsapp-deeplink.service";
import { WhatsAppFarmerService } from "./whatsapp-farmer.service";
import { WhatsAppLotService } from "./whatsapp-lot-service";
import { WhatsAppMarketService } from "./whatsapp-market-service";
import { WhatsAppOfferService } from "./whatsapp-offer-service";
import { WhatsAppPaymentService } from "./whatsapp-payment-service";
import { WhatsAppRateLimiter } from "./whatsapp-rate-limiter";
import { WhatsAppShipmentService } from "./whatsapp-shipment-service";
import { WhatsAppAccountController, WhatsAppWebhookController } from "./whatsapp-webhook.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

export interface WhatsAppModuleDeps {
  prisma: PrismaClient;
  auditService: AuditService;
  authRepository: AuthRepository;
  referenceDataService: ReferenceDataService;
  farmsRepository: FarmsRepository;
  farmerCropRepository: FarmerCropRepository;
  farmerProfileResolver: FarmerProfileResolver;
  lotsService: LotsService;
  qualityService: QualityService;
  buyerMatchingService: BuyerMatchingService;
  paymentService: PaymentService;
  shipmentService: ShipmentService;
  // Overridable seams (tests / future providers):
  config?: WhatsAppConfig;
  provider?: WhatsAppProvider;
  nluProvider?: WhatsAppNluProvider;
  speechToText?: SpeechToTextProvider;
  repository?: WhatsAppRepository;
  processInline?: boolean;
}

/** Used when WHATSAPP_ENABLED=false: guarantees no external WhatsApp call can ever be made. */
class DisabledWhatsAppProvider implements WhatsAppProvider {
  readonly name = "disabled";
  private fail(): never {
    throw new WhatsAppProviderError("WhatsApp integration is disabled", "DISABLED", null, false);
  }
  verifyWebhook() { return { ok: false as const }; }
  verifySignature() { return false; }
  async sendTextMessage(): Promise<never> { return this.fail(); }
  async sendInteractiveMessage(): Promise<never> { return this.fail(); }
  async sendListMessage(): Promise<never> { return this.fail(); }
  async sendTemplateMessage(): Promise<never> { return this.fail(); }
  async downloadMedia(): Promise<never> { return this.fail(); }
}

export interface WhatsAppModule {
  webhookRouter: Router;
  accountRouter: Router;
  webhookService: WhatsAppWebhookService;
  farmerService: WhatsAppFarmerService;
  router: WhatsAppCommandRouter;
  config: WhatsAppConfig;
}

/**
 * Composition root for the WhatsApp Farmer Assistant. It receives Anndata's
 * already-constructed services (lots, quality, matching, payments, shipments,
 * reference data, audit…) and wires the WhatsApp layer on top of them — no
 * business logic is re-implemented here.
 */
export function createWhatsAppModule(deps: WhatsAppModuleDeps): WhatsAppModule {
  const config = deps.config ?? loadWhatsAppConfig();
  const repo = deps.repository ?? new PrismaWhatsAppRepository(deps.prisma);
  const limiter = new WhatsAppRateLimiter();
  const urls = new AnndataUrlService(config.frontendUrl);

  const provider = deps.provider ?? (config.enabled ? new MetaWhatsAppProvider(config) : new DisabledWhatsAppProvider());
  const nlu = deps.nluProvider ?? (config.enabled && config.aiProvider === "gemini" ? new GeminiNluProvider(config) : new UnavailableNluProvider());
  const stt = deps.speechToText ?? new UnavailableSpeechToTextProvider();

  const catalog = new WhatsAppCatalogService(deps.referenceDataService, deps.prisma, deps.farmsRepository, deps.farmerCropRepository, deps.farmerProfileResolver);
  const market = new WhatsAppMarketService(new MarketIntelligenceRepository(deps.prisma), catalog, urls);
  const lotView = new WhatsAppLotService(deps.lotsService, deps.qualityService, urls, deps.auditService);
  const offers = new WhatsAppOfferService(deps.buyerMatchingService, deps.prisma, urls, deps.auditService);
  const payments = new WhatsAppPaymentService(deps.paymentService, deps.prisma, urls, deps.auditService);
  const shipments = new WhatsAppShipmentService(deps.shipmentService, urls, deps.auditService);
  const buyer = new WhatsAppBuyerAssistantService(catalog, deps.lotsService, lotView, deps.qualityService, deps.buyerMatchingService, market, urls, deps.auditService, limiter, config.matchingRateLimitPerHour);
  const intents = new WhatsAppIntentService(nlu, limiter, config.aiRateLimitPerHour);
  const router = new WhatsAppCommandRouter({ intents, buyer, market, lots: lotView, offers, payments, shipments, catalog, urls });

  const farmerService = new WhatsAppFarmerService(repo, deps.auditService, config, limiter);
  const conversations = new WhatsAppConversationService(repo, config.conversationTtlMinutes);
  const webhookService = new WhatsAppWebhookService({ config, provider, repo, farmers: farmerService, conversations, router, limiter, stt });

  const webhookController = new WhatsAppWebhookController(webhookService, { enabled: config.enabled, processInline: deps.processInline });
  const accountController = new WhatsAppAccountController(farmerService, "");

  return {
    webhookRouter: createWhatsAppWebhookRouter(webhookController),
    accountRouter: createWhatsAppAccountRouter(accountController, deps.authRepository, deps.auditService),
    webhookService,
    farmerService,
    router,
    config,
  };
}
