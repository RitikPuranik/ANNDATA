import { DeliveryEvidenceType, DeliveryStatus, PrismaClient, QualityGrade } from "@prisma/client";
import { AuthorizationError, ConflictError, DeliveryDomainError, NotFoundError } from "../../common/errors";
import { AuthenticatedUserContext, RequestMeta } from "../auth/auth.types";
import { AuditAction, AuditService } from "../audit/audit.service";
import { CropLotRepository } from "../lots/lots.repository";
import { FarmerProfileResolver } from "../farmers/farmer-profile.resolver";
import { QualityStandardRepository } from "../quality/quality.repository";
import { ShipmentRepository } from "../shipments/shipment.repository";
import { TransporterAuthorizationService } from "../transporters/transporter.authorization";
import { DeliveryAuthorizationService, LotOwnership } from "./delivery.authorization";
import { getDeliveryQuantityTolerancePercent, DELIVERY_RECONCILIATION_ALGORITHM_VERSION } from "./delivery.config";
import { DeliveryQualityAgreementResolver } from "./delivery-quality-agreement.resolver";
import { DeliveryQualityReconciliationEngine, ObservedMetric, QualityParameterResult } from "./delivery-quality-reconciliation.engine";
import { DeliveryQuantityReconciliationEngine } from "./delivery-quantity-reconciliation.engine";
import {
  CreateDeliveryData,
  DeliveryListFilters,
  DeliveryRepository,
} from "./delivery.repository";
import { DeliveryWeighmentRepository } from "./delivery-weighment.repository";
import { DeliveryQualityRepository } from "./delivery-quality.repository";
import { DeliveryReconciliationRepository } from "./delivery-reconciliation.repository";
import { DeliveryEvidenceRepository } from "./delivery-evidence.repository";
import {
  canTransitionDelivery,
  INSPECTABLE_STATUSES,
  RECONCILABLE_STATUSES,
} from "./delivery-state-machine";
import {
  DeliveryHandoffDTO,
  DeliveryPublicDTO,
  DeliveryQualityAssessmentDTO,
  DeliveryQualityAssessmentRecord,
  DeliveryReconciliationDTO,
  DeliveryReconciliationRecord,
  DeliveryRecord,
  DeliveryWeighmentDTO,
  DeliveryWeighmentRecord,
  QualityParameterExplanation,
  decimalToNumber,
  nullableDecimalToNumber,
} from "./delivery.types";

export interface CreateDeliveryInput {
  shipmentId: string;
}

export interface ReceiveDeliveryInput {
  manuallyRecordedQuantityKg?: number;
  receivedAt?: Date;
}

export interface RecordWeighmentInput {
  grossWeightKg: number;
  tareWeightKg: number;
  weightUnit: "KG" | "QTL" | "TONNE";
  weighingMethod: "WEIGHBRIDGE" | "ELECTRONIC_SCALE" | "MANUAL" | "OTHER";
  weighingTimestamp?: Date;
  scaleReference?: string;
  notes?: string;
}

export interface RecordQualityAssessmentInput {
  overallGrade?: QualityGrade;
  observations: ObservedMetric[];
  notes?: string;
}

export interface PartialAcceptInput {
  acceptedQuantityKg: number;
  rejectionReason?: string;
}

export interface AddEvidenceInput {
  evidenceType: DeliveryEvidenceType;
  storageProvider: string;
  externalId: string;
  secureUrl: string;
}

/**
 * Module 18 — Delivery & Quality Reconciliation. Orchestrates: delivery
 * creation from a completed Module 17 Shipment, receiving, weighment,
 * quality inspection (Module 5 integration via
 * DeliveryQualityAgreementResolver), the two deterministic reconciliation
 * engines, and the accept/partial-accept/reject decision that finalizes a
 * delivery. Never touches payment (Module 19) or ledger (Module 20) — see
 * getHandoff() at the bottom, which is the entire surface those modules
 * are expected to consume.
 */
export class DeliveryService {
  private readonly quantityEngine = new DeliveryQuantityReconciliationEngine();
  private readonly qualityEngine = new DeliveryQualityReconciliationEngine();
  private readonly qualityAgreement: DeliveryQualityAgreementResolver;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deliveries: DeliveryRepository,
    private readonly weighments: DeliveryWeighmentRepository,
    private readonly qualityAssessments: DeliveryQualityRepository,
    private readonly reconciliations: DeliveryReconciliationRepository,
    private readonly evidence: DeliveryEvidenceRepository,
    private readonly shipments: ShipmentRepository,
    private readonly lots: CropLotRepository,
    qualityStandards: QualityStandardRepository,
    private readonly authorization: DeliveryAuthorizationService,
    private readonly farmerProfiles: FarmerProfileResolver,
    private readonly transporterAuthorization: TransporterAuthorizationService,
    private readonly audit: AuditService,
  ) {
    this.qualityAgreement = new DeliveryQualityAgreementResolver(prisma, qualityStandards);
  }

  // ---------------------------------------------------------------------
  // Step 11/12 — creation
  // ---------------------------------------------------------------------

  async create(user: AuthenticatedUserContext, input: CreateDeliveryInput, meta?: RequestMeta): Promise<DeliveryPublicDTO> {
    const shipment = await this.shipments.findByPublicId(input.shipmentId);
    if (!shipment) throw new NotFoundError("Shipment not found.");

    // Step 11.4/11.5 — never allow a delivery disconnected from a valid,
    // completed, not-cancelled shipment that doesn't already have one.
    if (shipment.status === "CANCELLED") {
      throw new DeliveryDomainError("Cannot record a delivery for a cancelled shipment.", "SHIPMENT_NOT_ELIGIBLE_FOR_DELIVERY");
    }
    if (shipment.status !== "DELIVERED") {
      throw new DeliveryDomainError(
        "A delivery can only be recorded once Module 17 has marked the shipment DELIVERED.",
        "SHIPMENT_NOT_ELIGIBLE_FOR_DELIVERY",
      );
    }
    const existing = await this.deliveries.findByShipmentId(shipment.id);
    if (existing) {
      throw new DeliveryDomainError("A delivery has already been recorded for this shipment.", "DELIVERY_ALREADY_EXISTS");
    }

    // Step 11.6/11.7 — resolve the lot's accepted commercial transaction
    // server-side; the buyer relationship is never taken from the request.
    const tradeOffer = await this.prisma.tradeOffer.findFirst({
      where: { lotId: shipment.lotId, status: "ACCEPTED" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, buyerId: true },
    });
    if (!tradeOffer) {
      throw new DeliveryDomainError(
        "No accepted trade offer was found for this shipment's lot; cannot determine the buyer relationship.",
        "SHIPMENT_NOT_ELIGIBLE_FOR_DELIVERY",
      );
    }

    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    if (user.role !== "ADMIN" && (user.role !== "BUYER" || callerBuyerProfileId !== tradeOffer.buyerId)) {
      throw new AuthorizationError("Only the buyer of this trade may record a delivery for it.");
    }

    const createData: CreateDeliveryData = {
      shipmentId: shipment.id,
      lotId: shipment.lotId,
      tradeOfferId: tradeOffer.id,
      buyerId: tradeOffer.buyerId,
      expectedQuantityKg: decimalToNumber(shipment.quantityKg),
      quantityUnit: shipment.quantityUnit,
    };

    const created = await this.deliveries.create(createData);

    await this.audit.record({
      actorUserId: user.id,
      action: "DELIVERY_CREATED",
      entityType: "Delivery",
      entityId: created.id,
      metadata: { shipmentId: shipment.publicId, lotId: shipment.lotId },
      ...meta,
    });

    return this.buildDTO(created);
  }

  // ---------------------------------------------------------------------
  // Step 14 — receive
  // ---------------------------------------------------------------------

  async receive(
    user: AuthenticatedUserContext,
    publicId: string,
    input: ReceiveDeliveryInput,
    meta?: RequestMeta,
  ): Promise<DeliveryPublicDTO> {
    const delivery = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    this.authorization.assertCanOperate(user, delivery, callerBuyerProfileId);

    if (!canTransitionDelivery(delivery.status, "RECEIVED")) {
      throw new DeliveryDomainError(`Cannot mark a ${delivery.status} delivery as received.`, "INVALID_DELIVERY_TRANSITION");
    }

    // Step 14 — source-of-truth hierarchy: no weighment exists yet at this
    // point (receive() always happens first), so only an explicitly
    // permitted manual figure is ever recorded here; it is never invented.
    const updated = await this.deliveries.transition(delivery.id, [delivery.status], "RECEIVED", {
      receivedAt: input.receivedAt ?? new Date(),
      ...(input.manuallyRecordedQuantityKg !== undefined ? { deliveredQuantityKg: input.manuallyRecordedQuantityKg } : {}),
    });
    if (!updated) throw new ConflictError("This delivery was already updated by someone else. Please refresh and try again.");

    // Best-effort Module 4 lot-status advancement (Step 24's own
    // "IN_TRANSACTION -> DELIVERED -> COMPLETED" edge, reserved by
    // lot-status.service.ts for exactly this module). No module before
    // this one actually moves a lot into IN_TRANSACTION yet, so this is
    // deliberately non-blocking: if the lot isn't in a state this edge
    // applies to, the delivery still proceeds (documented as a limitation
    // in the module's final report).
    await this.tryAdvanceLotStatus(delivery.lotId, ["IN_TRANSACTION"], "DELIVERED", user.id);

    await this.audit.record({
      actorUserId: user.id,
      action: "DELIVERY_RECEIVED",
      entityType: "Delivery",
      entityId: delivery.id,
      ...meta,
    });

    return this.buildDTO(updated);
  }

  // ---------------------------------------------------------------------
  // Step 3 — weighment
  // ---------------------------------------------------------------------

  async recordWeighment(
    user: AuthenticatedUserContext,
    publicId: string,
    input: RecordWeighmentInput,
    meta?: RequestMeta,
  ): Promise<DeliveryPublicDTO> {
    const delivery = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    this.authorization.assertCanOperate(user, delivery, callerBuyerProfileId);
    this.assertInspectable(delivery);

    if (input.grossWeightKg < 0 || input.tareWeightKg < 0 || input.grossWeightKg < input.tareWeightKg) {
      throw new DeliveryDomainError("Gross and tare weight must be non-negative and gross must be >= tare.", "INVALID_WEIGHMENT");
    }
    // Step 3 — net weight is always calculated server-side; a
    // client-supplied net figure, if any slipped through, is never used.
    const netWeightKg = round2(input.grossWeightKg - input.tareWeightKg);
    if (netWeightKg < 0) throw new DeliveryDomainError("Calculated net weight cannot be negative.", "INVALID_WEIGHMENT");

    await this.weighments.create({
      deliveryId: delivery.id,
      grossWeightKg: input.grossWeightKg,
      tareWeightKg: input.tareWeightKg,
      netWeightKg,
      weightUnit: input.weightUnit,
      weighingMethod: input.weighingMethod,
      weighingTimestamp: input.weighingTimestamp ?? new Date(),
      scaleReference: input.scaleReference ?? null,
      recordedByUserId: user.id,
      notes: input.notes ?? null,
    });

    // Step 14 — a verified weighment always outranks any earlier manual
    // figure.
    await this.deliveries.updateQuantities(delivery.id, { deliveredQuantityKg: netWeightKg });
    const advanced = await this.moveToUnderInspectionIfNeeded(delivery);

    await this.audit.record({
      actorUserId: user.id,
      action: "DELIVERY_WEIGHMENT_RECORDED",
      entityType: "Delivery",
      entityId: delivery.id,
      metadata: { grossWeightKg: input.grossWeightKg, tareWeightKg: input.tareWeightKg, netWeightKg },
      ...meta,
    });

    return this.buildDTO(advanced);
  }

  // ---------------------------------------------------------------------
  // Step 4/5/6/23 — quality inspection
  // ---------------------------------------------------------------------

  async recordQualityAssessment(
    user: AuthenticatedUserContext,
    publicId: string,
    input: RecordQualityAssessmentInput,
    meta?: RequestMeta,
  ): Promise<DeliveryPublicDTO> {
    const delivery = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    this.authorization.assertCanOperate(user, delivery, callerBuyerProfileId);
    this.assertInspectable(delivery);

    const lot = await this.lots.findById(delivery.lotId);
    if (!lot) throw new NotFoundError("Lot not found.");

    const agreed = await this.qualityAgreement.resolve(delivery.lotId, lot.cropId, delivery.tradeOfferId);
    const result = this.qualityEngine.reconcile({
      agreedGrade: agreed.grade,
      agreedThresholds: agreed.thresholds,
      observedGrade: input.overallGrade ?? null,
      observations: input.observations,
    });

    await this.qualityAssessments.create({
      deliveryId: delivery.id,
      inspectorUserId: user.id,
      overallGrade: input.overallGrade ?? null,
      overallResult: result.status,
      algorithmVersion: DELIVERY_RECONCILIATION_ALGORITHM_VERSION,
      notes: input.notes ?? null,
      observations: result.parameters,
    });

    const advanced = await this.moveToUnderInspectionIfNeeded(delivery);

    await this.audit.record({
      actorUserId: user.id,
      action: "DELIVERY_QUALITY_ASSESSED",
      entityType: "Delivery",
      entityId: delivery.id,
      metadata: { overallResult: result.status, agreedQualitySource: agreed.source },
      ...meta,
    });

    return this.buildDTO(advanced);
  }

  // ---------------------------------------------------------------------
  // Step 7/8/9/16 — reconciliation (provisional, pre-decision)
  // ---------------------------------------------------------------------

  async reconcile(user: AuthenticatedUserContext, publicId: string, meta?: RequestMeta): Promise<DeliveryReconciliationDTO> {
    const delivery = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    this.authorization.assertCanOperate(user, delivery, callerBuyerProfileId);

    if (!(RECONCILABLE_STATUSES as string[]).includes(delivery.status)) {
      throw new DeliveryDomainError(
        `A delivery must be RECEIVED and under inspection before it can be reconciled (currently ${delivery.status}).`,
        "DELIVERY_NOT_YET_RECEIVED",
      );
    }

    const record = await this.runReconciliation(delivery, delivery.status);

    await this.audit.record({
      actorUserId: user.id,
      action: "DELIVERY_RECONCILIATION_CALCULATED",
      entityType: "Delivery",
      entityId: delivery.id,
      metadata: { quantityResult: record.quantityResult, qualityResult: record.qualityResult },
      ...meta,
    });

    return this.toReconciliationDTO(record);
  }

  private async runReconciliation(delivery: DeliveryRecord, overallStatus: DeliveryStatus, acceptedQuantityKgOverride?: number) {
    const deliveredQuantityKg = nullableDecimalToNumber(delivery.deliveredQuantityKg);
    if (deliveredQuantityKg === null) {
      throw new DeliveryDomainError("A weighment or manually recorded quantity must exist before reconciling.", "DELIVERY_NOT_YET_RECEIVED");
    }
    const expectedQuantityKg = decimalToNumber(delivery.expectedQuantityKg);
    const acceptedQuantityKg = acceptedQuantityKgOverride ?? deliveredQuantityKg;

    const tolerancePercent = getDeliveryQuantityTolerancePercent();
    const quantity = this.quantityEngine.reconcile({ expectedQuantityKg, deliveredQuantityKg, tolerancePercent });

    const latestQA = await this.qualityAssessments.findLatestByDeliveryId(delivery.id);
    const qualityResult = latestQA?.overallResult ?? "PENDING";
    const qualityParameters: QualityParameterExplanation[] = latestQA
      ? latestQA.observations.map((o) => ({
          name: o.metricName,
          expected:
            o.expectedMin !== null && o.expectedMax !== null
              ? `${nullableDecimalToNumber(o.expectedMin)} - ${nullableDecimalToNumber(o.expectedMax)}`
              : o.expectedMax !== null
                ? `<= ${nullableDecimalToNumber(o.expectedMax)}`
                : o.expectedMin !== null
                  ? `>= ${nullableDecimalToNumber(o.expectedMin)}`
                  : "no agreed threshold",
          actual: decimalToNumber(o.value),
          passed: o.passed,
          variance: nullableDecimalToNumber(o.variance),
        }))
      : [];
    if (latestQA?.overallGrade) {
      qualityParameters.unshift({
        name: "grade",
        expected: latestQA.overallGrade,
        actual: latestQA.overallGrade,
        passed: true,
        variance: null,
      });
    }

    return this.reconciliations.create({
      deliveryId: delivery.id,
      expectedQuantityKg,
      deliveredQuantityKg,
      acceptedQuantityKg,
      quantityVarianceKg: quantity.varianceKg,
      quantityTolerancePercent: tolerancePercent,
      quantityResult: quantity.result,
      qualityResult,
      overallStatus,
      algorithmVersion: DELIVERY_RECONCILIATION_ALGORITHM_VERSION,
      explanation: {
        quantity: {
          expected: expectedQuantityKg,
          delivered: deliveredQuantityKg,
          variance: quantity.varianceKg,
          tolerancePercent,
          result: quantity.result,
        },
        quality: { result: qualityResult, parameters: qualityParameters },
      },
    });
  }

  // ---------------------------------------------------------------------
  // Step 17/18/19 — acceptance decisions
  // ---------------------------------------------------------------------

  async accept(user: AuthenticatedUserContext, publicId: string, meta?: RequestMeta): Promise<DeliveryPublicDTO> {
    const delivery = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    this.authorization.assertCanOperate(user, delivery, callerBuyerProfileId);

    const deliveredQuantityKg = nullableDecimalToNumber(delivery.deliveredQuantityKg);
    if (deliveredQuantityKg === null) {
      throw new DeliveryDomainError("Cannot accept a delivery with no recorded delivered quantity.", "DELIVERY_NOT_YET_RECEIVED");
    }

    const accepted = await this.deliveries.transition(delivery.id, ["UNDER_INSPECTION"], "ACCEPTED", {
      acceptedAt: new Date(),
      acceptedQuantityKg: deliveredQuantityKg,
      rejectedQuantityKg: 0,
    });
    if (!accepted) {
      throw new ConflictError("This delivery has already been decided (accepted, rejected, or partially accepted).");
    }

    await this.reconcileAndFinalize(accepted, "ACCEPTED", deliveredQuantityKg, user, "DELIVERY_ACCEPTED", meta);
    const final = await this.loadOrThrow(publicId);
    return this.buildDTO(final);
  }

  async partialAccept(
    user: AuthenticatedUserContext,
    publicId: string,
    input: PartialAcceptInput,
    meta?: RequestMeta,
  ): Promise<DeliveryPublicDTO> {
    const delivery = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    this.authorization.assertCanOperate(user, delivery, callerBuyerProfileId);

    const deliveredQuantityKg = nullableDecimalToNumber(delivery.deliveredQuantityKg);
    if (deliveredQuantityKg === null) {
      throw new DeliveryDomainError("Cannot partially accept a delivery with no recorded delivered quantity.", "DELIVERY_NOT_YET_RECEIVED");
    }
    // Step 17 — the accepted quantity must never exceed what was actually
    // delivered.
    if (input.acceptedQuantityKg > deliveredQuantityKg) {
      throw new DeliveryDomainError(
        "Accepted quantity cannot exceed the delivered quantity.",
        "ACCEPTED_QUANTITY_EXCEEDS_DELIVERED",
      );
    }
    if (input.acceptedQuantityKg <= 0) {
      throw new DeliveryDomainError("Accepted quantity must be greater than zero for a partial acceptance.", "INVALID_ACCEPTANCE_QUANTITY");
    }
    const rejectedQuantityKg = round2(deliveredQuantityKg - input.acceptedQuantityKg);

    const updated = await this.deliveries.transition(delivery.id, ["UNDER_INSPECTION"], "PARTIALLY_ACCEPTED", {
      acceptedAt: new Date(),
      acceptedQuantityKg: input.acceptedQuantityKg,
      rejectedQuantityKg,
      rejectionReason: input.rejectionReason ?? null,
    });
    if (!updated) {
      throw new ConflictError("This delivery has already been decided (accepted, rejected, or partially accepted).");
    }

    await this.reconcileAndFinalize(updated, "PARTIALLY_ACCEPTED", input.acceptedQuantityKg, user, "DELIVERY_PARTIALLY_ACCEPTED", meta);
    const final = await this.loadOrThrow(publicId);
    return this.buildDTO(final);
  }

  async reject(user: AuthenticatedUserContext, publicId: string, reason: string, meta?: RequestMeta): Promise<DeliveryPublicDTO> {
    const delivery = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    this.authorization.assertCanOperate(user, delivery, callerBuyerProfileId);

    const deliveredQuantityKg = nullableDecimalToNumber(delivery.deliveredQuantityKg);
    if (deliveredQuantityKg === null) {
      throw new DeliveryDomainError("Cannot reject a delivery with no recorded delivered quantity.", "DELIVERY_NOT_YET_RECEIVED");
    }

    const updated = await this.deliveries.transition(delivery.id, ["UNDER_INSPECTION"], "REJECTED", {
      rejectedAt: new Date(),
      acceptedQuantityKg: 0,
      rejectedQuantityKg: deliveredQuantityKg,
      rejectionReason: reason,
    });
    if (!updated) {
      throw new ConflictError("This delivery has already been decided (accepted, rejected, or partially accepted).");
    }

    await this.reconcileAndFinalize(updated, "REJECTED", 0, user, "DELIVERY_REJECTED", meta);
    const final = await this.loadOrThrow(publicId);
    return this.buildDTO(final);
  }

  /** Step 16/21 — records the final, decision-bearing DeliveryReconciliation
   * row and immediately closes the delivery out to RECONCILED (Step 10's
   * own lifecycle diagram: a decision is always followed by RECONCILED,
   * never left dangling). Step 24 — also opportunistically advances the
   * lot to COMPLETED (best-effort, see receive()'s own comment). */
  private async reconcileAndFinalize(
    delivery: DeliveryRecord,
    decisionStatus: DeliveryStatus,
    acceptedQuantityKg: number,
    user: AuthenticatedUserContext,
    decisionAuditAction: AuditAction,
    meta?: RequestMeta,
  ): Promise<void> {
    await this.runReconciliation(delivery, decisionStatus, acceptedQuantityKg);
    await this.audit.record({ actorUserId: user.id, action: decisionAuditAction, entityType: "Delivery", entityId: delivery.id, ...meta });

    const reconciled = await this.deliveries.transition(delivery.id, [decisionStatus], "RECONCILED", { reconciledAt: new Date() });
    if (reconciled) {
      await this.audit.record({ actorUserId: user.id, action: "DELIVERY_RECONCILED", entityType: "Delivery", entityId: delivery.id, ...meta });
      if (decisionStatus !== "REJECTED") {
        await this.tryAdvanceLotStatus(delivery.lotId, ["DELIVERED"], "COMPLETED", user.id);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Step 15 — evidence
  // ---------------------------------------------------------------------

  async addEvidence(user: AuthenticatedUserContext, publicId: string, input: AddEvidenceInput, meta?: RequestMeta): Promise<DeliveryPublicDTO> {
    const delivery = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    this.authorization.assertCanOperate(user, delivery, callerBuyerProfileId);

    await this.evidence.create({
      deliveryId: delivery.id,
      evidenceType: input.evidenceType,
      storageProvider: input.storageProvider,
      externalId: input.externalId,
      secureUrl: input.secureUrl,
      uploadedByUserId: user.id,
    });

    await this.audit.record({
      actorUserId: user.id,
      action: "DELIVERY_EVIDENCE_ADDED",
      entityType: "Delivery",
      entityId: delivery.id,
      metadata: { evidenceType: input.evidenceType },
      ...meta,
    });

    return this.buildDTO(delivery);
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async get(user: AuthenticatedUserContext, publicId: string): Promise<DeliveryPublicDTO> {
    const delivery = await this.loadOrThrow(publicId);
    await this.assertCanView(user, delivery);
    return this.buildDTO(delivery);
  }

  async list(user: AuthenticatedUserContext, filters: DeliveryListFilters): Promise<{ items: DeliveryPublicDTO[]; total: number }> {
    const scoped = { ...filters };

    if (user.role === "BUYER") {
      const buyerProfileId = await this.resolveCallerBuyerProfileId(user);
      if (!buyerProfileId) return { items: [], total: 0 };
      scoped.buyerId = buyerProfileId;
    } else if (user.role === "FARMER") {
      const farmer = await this.farmerProfiles.ensure(user.id);
      const { items: lots } = await this.lots.listByFarmerId(farmer.id, {}, 1, 1000);
      scoped.lotIds = lots.map((l) => l.id);
    } else if (user.role === "FPO_ADMIN") {
      // Scoping by FPO membership is enforced per-item in assertCanView for
      // reads of a single delivery; for the list endpoint, an FPO admin
      // with no lots resolvable here simply sees an empty page rather than
      // reimplementing FpoAuthorizationService's own membership resolution.
      scoped.lotIds = scoped.lotIds ?? [];
    } else if (user.role === "TRANSPORTER") {
      const providerId = await this.resolveCallerTransportProviderId(user);
      if (!providerId) return { items: [], total: 0 };
      const shipmentRows = await this.prisma.shipment.findMany({ where: { transportProviderId: providerId }, select: { id: true } });
      scoped.shipmentIds = shipmentRows.map((s) => s.id);
    }
    // ADMIN — no additional scoping.

    const page = await this.deliveries.list(scoped);
    const items = await Promise.all(page.items.map((d) => this.buildDTO(d)));
    return { items, total: page.total };
  }

  // ---------------------------------------------------------------------
  // Step 25 — Module 19 handoff
  // ---------------------------------------------------------------------

  async getHandoff(user: AuthenticatedUserContext, publicId: string): Promise<DeliveryHandoffDTO> {
    const delivery = await this.loadOrThrow(publicId);
    await this.assertCanView(user, delivery);
    const [shipment, lot, latestQA] = await Promise.all([
      this.prisma.shipment.findUnique({ where: { id: delivery.shipmentId } }),
      this.lots.findById(delivery.lotId),
      this.qualityAssessments.findLatestByDeliveryId(delivery.id),
    ]);
    if (!shipment || !lot) throw new NotFoundError("Delivery's shipment or lot could not be resolved.");

    const agreed = delivery.tradeOfferId ? await this.qualityAgreement.resolve(delivery.lotId, lot.cropId, delivery.tradeOfferId) : null;
    const moistureThreshold = agreed?.thresholds.find((t) => t.metricCode === "moisture") ?? null;
    const foreignMatterThreshold = agreed?.thresholds.find((t) => t.metricCode === "foreignMatter") ?? null;

    return {
      shipmentId: shipment.publicId,
      tradeOfferId: delivery.tradeOfferId,
      lotId: lot.publicId,
      buyerId: delivery.buyerId,
      sellerFarmerId: lot.farmerId,
      sellerFpoId: lot.fpoId,
      expectedQuantity: decimalToNumber(delivery.expectedQuantityKg),
      deliveredQuantity: nullableDecimalToNumber(delivery.deliveredQuantityKg),
      acceptedQuantity: nullableDecimalToNumber(delivery.acceptedQuantityKg),
      rejectedQuantity: nullableDecimalToNumber(delivery.rejectedQuantityKg),
      agreedCommodity: shipment.commodity,
      agreedQuality: agreed
        ? { grade: agreed.grade, moistureMax: moistureThreshold?.max ?? null, foreignMatterMax: foreignMatterThreshold?.max ?? null }
        : null,
      actualQuality: latestQA ? { grade: latestQA.overallGrade, result: latestQA.overallResult } : null,
      reconciliationStatus: delivery.status,
      logisticsAmount: decimalToNumber(shipment.agreedAmount),
      logisticsCurrency: shipment.currency,
      deliveryTimestamp: (delivery.reconciledAt ?? delivery.acceptedAt ?? delivery.rejectedAt ?? delivery.receivedAt)?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async loadOrThrow(publicId: string): Promise<DeliveryRecord> {
    const delivery = await this.deliveries.findByPublicId(publicId);
    if (!delivery) throw new NotFoundError("Delivery not found.");
    return delivery;
  }

  private assertInspectable(delivery: DeliveryRecord): void {
    if (!(INSPECTABLE_STATUSES as string[]).includes(delivery.status)) {
      throw new DeliveryDomainError(
        `A delivery must be RECEIVED or UNDER_INSPECTION to record this (currently ${delivery.status}).`,
        "DELIVERY_NOT_MUTABLE",
      );
    }
  }

  private async moveToUnderInspectionIfNeeded(delivery: DeliveryRecord): Promise<DeliveryRecord> {
    if (delivery.status !== "RECEIVED") return delivery;
    const advanced = await this.deliveries.transition(delivery.id, ["RECEIVED"], "UNDER_INSPECTION");
    return advanced ?? delivery;
  }

  private async tryAdvanceLotStatus(lotId: string, fromStatuses: string[], toStatus: string, actorUserId: string): Promise<void> {
    try {
      await this.lots.transition(lotId, fromStatuses as never, toStatus as never, {
        actorUserId,
        reason: `Module 18 delivery lifecycle: ${toStatus}`,
      } as never);
    } catch {
      // Best-effort only — see this method's call sites' own comments.
    }
  }

  private async resolveCallerBuyerProfileId(user: AuthenticatedUserContext): Promise<string | null> {
    if (user.role !== "BUYER") return null;
    const buyer = await this.prisma.buyerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return buyer?.id ?? null;
  }

  private async resolveCallerTransportProviderId(user: AuthenticatedUserContext): Promise<string | null> {
    if (user.role !== "TRANSPORTER") return null;
    try {
      return (await this.transporterAuthorization.resolveOwnProfile(user)).id;
    } catch {
      return null;
    }
  }

  private async resolveLotOwnership(lotId: string): Promise<LotOwnership> {
    const lot = await this.lots.findById(lotId);
    if (!lot) throw new NotFoundError("Lot not found.");
    return { ownerType: lot.ownerType, farmerId: lot.farmerId, fpoId: lot.fpoId };
  }

  private async assertCanView(user: AuthenticatedUserContext, delivery: DeliveryRecord): Promise<void> {
    const lot = await this.resolveLotOwnership(delivery.lotId);
    const [callerFarmerProfileId, callerBuyerProfileId, callerTransportProviderId] = await Promise.all([
      user.role === "FARMER" ? (await this.farmerProfiles.ensure(user.id)).id : Promise.resolve(null),
      this.resolveCallerBuyerProfileId(user),
      user.role === "TRANSPORTER" ? this.resolveCallerTransportProviderId(user) : Promise.resolve(null),
    ]);
    const allowed = await this.authorization.canView(
      user,
      delivery,
      lot,
      callerFarmerProfileId,
      callerBuyerProfileId,
      callerTransportProviderId,
    );
    if (!allowed) throw new AuthorizationError("You do not have permission to view this delivery.");
  }

  private async buildDTO(delivery: DeliveryRecord): Promise<DeliveryPublicDTO> {
    const [latestWeighment, latestQA, latestReconciliation] = await Promise.all([
      this.weighments.findLatestByDeliveryId(delivery.id),
      this.qualityAssessments.findLatestByDeliveryId(delivery.id),
      this.reconciliations.findLatestByDeliveryId(delivery.id),
    ]);

    return {
      deliveryId: delivery.publicId,
      deliveryNumber: delivery.deliveryNumber,
      shipmentId: delivery.shipmentId,
      lotId: delivery.lotId,
      tradeOfferId: delivery.tradeOfferId,
      buyerId: delivery.buyerId,
      expectedQuantity: decimalToNumber(delivery.expectedQuantityKg),
      deliveredQuantity: nullableDecimalToNumber(delivery.deliveredQuantityKg),
      acceptedQuantity: nullableDecimalToNumber(delivery.acceptedQuantityKg),
      rejectedQuantity: nullableDecimalToNumber(delivery.rejectedQuantityKg),
      quantityUnit: delivery.quantityUnit,
      status: delivery.status,
      receivedAt: delivery.receivedAt?.toISOString() ?? null,
      acceptedAt: delivery.acceptedAt?.toISOString() ?? null,
      rejectedAt: delivery.rejectedAt?.toISOString() ?? null,
      reconciledAt: delivery.reconciledAt?.toISOString() ?? null,
      rejectionReason: delivery.rejectionReason,
      latestWeighment: latestWeighment ? this.toWeighmentDTO(latestWeighment) : null,
      latestQualityAssessment: latestQA ? this.toQualityAssessmentDTO(latestQA) : null,
      latestReconciliation: latestReconciliation ? this.toReconciliationDTO(latestReconciliation) : null,
      createdAt: delivery.createdAt.toISOString(),
      updatedAt: delivery.updatedAt.toISOString(),
    };
  }

  private toWeighmentDTO(record: DeliveryWeighmentRecord): DeliveryWeighmentDTO {
    return {
      grossWeight: decimalToNumber(record.grossWeightKg),
      tareWeight: decimalToNumber(record.tareWeightKg),
      netWeight: decimalToNumber(record.netWeightKg),
      weightUnit: record.weightUnit,
      weighingMethod: record.weighingMethod,
      weighingTimestamp: record.weighingTimestamp.toISOString(),
      scaleReference: record.scaleReference,
      notes: record.notes,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private toQualityAssessmentDTO(record: DeliveryQualityAssessmentRecord): DeliveryQualityAssessmentDTO {
    return {
      publicId: record.publicId,
      overallGrade: record.overallGrade,
      overallResult: record.overallResult,
      assessedAt: record.assessedAt.toISOString(),
      notes: record.notes,
      observations: record.observations.map((o) => ({
        metricCode: o.metricCode,
        metricName: o.metricName,
        value: decimalToNumber(o.value),
        unit: o.unit,
        expected:
          o.expectedMin !== null || o.expectedMax !== null
            ? { min: nullableDecimalToNumber(o.expectedMin), max: nullableDecimalToNumber(o.expectedMax) }
            : null,
        passed: o.passed,
        variance: nullableDecimalToNumber(o.variance),
      })),
    };
  }

  private toReconciliationDTO(record: DeliveryReconciliationRecord): DeliveryReconciliationDTO {
    const explanation = record.explanation as DeliveryReconciliationDTO["explanation"];
    return {
      publicId: record.publicId,
      expectedQuantity: decimalToNumber(record.expectedQuantityKg),
      deliveredQuantity: decimalToNumber(record.deliveredQuantityKg),
      acceptedQuantity: decimalToNumber(record.acceptedQuantityKg),
      quantityVariance: decimalToNumber(record.quantityVarianceKg),
      quantityTolerancePercent: decimalToNumber(record.quantityTolerancePercent),
      quantityResult: record.quantityResult,
      qualityResult: record.qualityResult,
      overallStatus: record.overallStatus,
      explanation,
      algorithmVersion: record.algorithmVersion,
      calculatedAt: record.calculatedAt.toISOString(),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
