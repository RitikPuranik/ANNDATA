import { PrismaClient } from "@prisma/client";
import { NotFoundError, ShipmentDomainError } from "../../common/errors";
import { trackEvent } from "../../config/posthog";
import { AuthenticatedUserContext, RequestMeta } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { CropLotRepository } from "../lots/lots.repository";
import { FarmerProfileResolver } from "../farmers/farmer-profile.resolver";
import { LogisticsRequestRepository } from "../logistics/logistics-request.repository";
import { LogisticsQuoteRepository } from "../logistics/logistics-quote.repository";
import { TransporterRepository } from "../transporters/transporter.repository";
import { VehicleRepository } from "../transporters/vehicle.repository";
import { TransporterAuthorizationService } from "../transporters/transporter.authorization";
import { GeoPoint, RouteDistanceProvider, haversineDistanceKm } from "../logistics/route-distance.provider";
import { ShipmentAuthorizationService, LotOwnership } from "./shipment.authorization";
import { ShipmentDriverRepository } from "./shipment-driver.repository";
import { CreateShipmentData, ShipmentListFilters, ShipmentRepository, isUniqueConstraintError } from "./shipment.repository";
import { ShipmentLocationRepository } from "./shipment-location.repository";
import { ShipmentEventRepository } from "./shipment-event.repository";
import { getCachedLatestLocation, setCachedLatestLocation } from "./shipment-location-cache";
import { getGpsFutureTimestampToleranceSeconds } from "./shipment.config";
import {
  CANCELLABLE_FROM_STATUSES,
  LOCATION_UPDATABLE_STATUSES,
  canTransitionShipment,
  isTerminalShipmentStatus,
} from "./shipment-state-machine";
import {
  LatestLocationDTO,
  ShipmentEtaDTO,
  ShipmentHandoffDTO,
  ShipmentLocationPublicDTO,
  ShipmentPublicDTO,
  ShipmentRecord,
  ShipmentRouteProgressDTO,
  decimalToNumber,
  nullableDecimalToNumber,
} from "./shipment.types";

export interface CreateShipmentInput {
  logisticsRequestId: string;
}

export interface SubmitLocationInput {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  speedKmh?: number;
  headingDegrees?: number;
  recordedAt?: Date;
  source: "DRIVER_APP" | "GPS_DEVICE" | "IOT_DEVICE" | "ADMIN" | "SYSTEM";
}

export interface ListShipmentsInput {
  status?: import("@prisma/client").ShipmentStatus;
  providerId?: string;
  vehicleId?: string;
  lotId?: string;
  page: number;
  limit: number;
}

export interface ListLocationsInput {
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

/**
 * Module 17 — Shipment & GPS Tracking. Every write re-validates ownership/
 * eligibility server-side (same "never trust the client about who owns
 * what" convention as Module 15/16's own services) — the only things ever
 * trusted from the client are publicIds used to look rows up.
 */
export class ShipmentService {
  constructor(
    private readonly shipments: ShipmentRepository,
    private readonly locations: ShipmentLocationRepository,
    private readonly events: ShipmentEventRepository,
    private readonly logisticsRequests: LogisticsRequestRepository,
    private readonly logisticsQuotes: LogisticsQuoteRepository,
    private readonly cropLots: CropLotRepository,
    private readonly farmerProfiles: FarmerProfileResolver,
    private readonly transporters: TransporterRepository,
    private readonly vehicles: VehicleRepository,
    private readonly drivers: ShipmentDriverRepository,
    private readonly transporterAuthorization: TransporterAuthorizationService,
    private readonly authorization: ShipmentAuthorizationService,
    private readonly routeDistanceProvider: RouteDistanceProvider,
    private readonly audit: AuditService,
    private readonly prisma: PrismaClient,
  ) {}

  // ---------------------------------------------------------------------
  // Shared lookups
  // ---------------------------------------------------------------------

  private async loadShipmentOrThrow(publicId: string): Promise<ShipmentRecord> {
    const shipment = await this.shipments.findByPublicId(publicId);
    if (!shipment) throw new NotFoundError("Shipment not found.");
    return shipment;
  }

  private async loadLotOwnership(lotId: string): Promise<LotOwnership> {
    const lot = await this.cropLots.findById(lotId);
    if (!lot) throw new NotFoundError("Lot not found.");
    return { ownerType: lot.ownerType, farmerId: lot.farmerId, fpoId: lot.fpoId };
  }

  private async resolveCallerFarmerProfileId(user: AuthenticatedUserContext): Promise<string | null> {
    if (user.role !== "FARMER") return null;
    return (await this.farmerProfiles.ensure(user.id)).id;
  }

  private async resolveCallerTransporterProfileId(user: AuthenticatedUserContext): Promise<string | null> {
    if (user.role !== "TRANSPORTER") return null;
    try {
      return (await this.transporterAuthorization.resolveOwnProfile(user)).id;
    } catch {
      return null;
    }
  }

  private async assertCanView(user: AuthenticatedUserContext, shipment: ShipmentRecord): Promise<void> {
    const lot = await this.loadLotOwnership(shipment.lotId);
    const callerFarmerProfileId = await this.resolveCallerFarmerProfileId(user);
    const callerTransporterProfileId = await this.resolveCallerTransporterProfileId(user);
    const canView = await this.authorization.canView(user, shipment, lot, callerFarmerProfileId, callerTransporterProfileId);
    if (!canView) {
      throw new ShipmentDomainError("You do not have permission to view this shipment.", "UNAUTHORIZED_SHIPMENT_ACCESS", 403);
    }
  }

  // ---------------------------------------------------------------------
  // Step 4 — creation from an accepted Module 16 quote
  // ---------------------------------------------------------------------

  async createFromAcceptedQuote(
    user: AuthenticatedUserContext,
    input: CreateShipmentInput,
    meta?: RequestMeta,
  ): Promise<ShipmentPublicDTO> {
    const request = await this.logisticsRequests.findByPublicId(input.logisticsRequestId);
    if (!request) throw new NotFoundError("Logistics request not found.");

    const lot = await this.cropLots.findById(request.lotId);
    if (!lot) throw new NotFoundError("Lot not found.");

    // Step 4/8 — only the requester side (or their FPO's other admins) or
    // ADMIN may turn an accepted quote into a shipment; a TRANSPORTER
    // never initiates their own dispatch.
    if (user.role === "TRANSPORTER") {
      throw new ShipmentDomainError("Transport providers cannot create a shipment.", "UNAUTHORIZED_SHIPMENT_ACCESS", 403);
    }
    if (user.role !== "ADMIN") {
      const callerFarmerProfileId = await this.resolveCallerFarmerProfileId(user);
      const isRequester = request.requesterUserId === user.id;
      const isFpoCoAdmin =
        !isRequester && lot.ownerType === "FPO" && lot.fpoId
          ? await this.prisma.fpoAdmin
              .findFirst({ where: { userId: user.id, fpoId: lot.fpoId, status: "ACTIVE" }, select: { id: true } })
              .then((row) => row !== null)
          : false;
      const isOwnLot = lot.ownerType === "FARMER" && callerFarmerProfileId !== null && lot.farmerId === callerFarmerProfileId;
      if (!isRequester && !isFpoCoAdmin && !isOwnLot) {
        throw new ShipmentDomainError(
          "You do not have permission to create a shipment for this logistics request.",
          "UNAUTHORIZED_SHIPMENT_ACCESS",
          403,
        );
      }
    }

    // Step 4 — quote exists, is ACCEPTED, and belongs to this request.
    if (request.status !== "QUOTE_ACCEPTED" || !request.acceptedQuoteId) {
      throw new ShipmentDomainError(
        "This logistics request does not have an accepted quote yet.",
        "LOGISTICS_QUOTE_NOT_ACCEPTED",
      );
    }
    const quote = await this.logisticsQuotes.findById(request.acceptedQuoteId);
    if (!quote || quote.status !== "ACCEPTED") {
      throw new ShipmentDomainError(
        "This logistics request does not have an accepted quote yet.",
        "LOGISTICS_QUOTE_NOT_ACCEPTED",
      );
    }

    // Step 4 — no existing shipment for this request or this quote.
    const existingByRequest = await this.shipments.findByLogisticsRequestId(request.id);
    if (existingByRequest) {
      throw new ShipmentDomainError("A shipment already exists for this logistics request.", "SHIPMENT_ALREADY_EXISTS", 409);
    }
    const existingByQuote = await this.shipments.findByAcceptedQuoteId(quote.id);
    if (existingByQuote) {
      throw new ShipmentDomainError("A shipment already exists for this accepted quote.", "SHIPMENT_ALREADY_EXISTS", 409);
    }

    // Step 4/5 — re-verify vehicle/provider server-side rather than trust
    // anything about them from the request body (the body only ever
    // carries the request's own publicId — see createShipmentBody).
    const vehicle = await this.vehicles.findById(quote.vehicleId);
    if (!vehicle) throw new NotFoundError("Vehicle not found.");
    const provider = await this.transporters.findById(quote.transportProviderId);
    if (!provider) throw new NotFoundError("Transport provider not found.");
    if (vehicle.transporterId !== provider.id) {
      throw new ShipmentDomainError("The quoted vehicle does not belong to the quoted provider.", "DRIVER_NOT_ELIGIBLE", 422);
    }
    if (!provider.isActive) {
      throw new ShipmentDomainError("This transport provider is not currently active.", "LOGISTICS_QUOTE_NOT_ACCEPTED");
    }
    if (vehicle.status !== "ACTIVE") {
      throw new ShipmentDomainError("This vehicle is not currently active.", "LOGISTICS_QUOTE_NOT_ACCEPTED");
    }

    const crop = await this.prisma.crop.findUnique({ where: { id: request.cropId }, select: { name: true } });

    const data: CreateShipmentData = {
      logisticsRequestId: request.id,
      acceptedQuoteId: quote.id,
      lotId: request.lotId,
      transportProviderId: provider.id,
      vehicleId: vehicle.id,
      commodity: crop?.name ?? "Unknown crop",
      quantityKg: decimalToNumber(request.requiredQuantityKg),
      quantityUnit: request.quantityUnit,
      pickupAddress: request.pickupAddress,
      pickupDistrict: request.pickupDistrict,
      pickupState: request.pickupState,
      pickupLatitude: request.pickupLatitude,
      pickupLongitude: request.pickupLongitude,
      destinationAddress: request.destinationAddress,
      destinationDistrict: request.destinationDistrict,
      destinationState: request.destinationState,
      destinationLatitude: request.destinationLatitude,
      destinationLongitude: request.destinationLongitude,
      agreedAmount: decimalToNumber(quote.quotedAmount),
      currency: quote.currency,
      estimatedDistanceKm: nullableDecimalToNumber(quote.estimatedDistanceKm) ?? nullableDecimalToNumber(request.estimatedDistanceKm),
      estimatedDurationMinutes: quote.estimatedDurationMinutes ?? request.estimatedDurationMinutes,
      scheduledPickupAt: quote.estimatedPickupTime ?? request.requestedPickupAt,
      estimatedDeliveryAt: quote.estimatedDeliveryTime ?? request.deliveryDeadline,
    };

    let created;
    try {
      created = await this.shipments.create(data);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ShipmentDomainError("A shipment already exists for this accepted quote.", "SHIPMENT_ALREADY_EXISTS", 409);
      }
      throw err;
    }

    await this.events.create({
      shipmentId: created.id,
      eventType: "SHIPMENT_CREATED",
      previousStatus: null,
      newStatus: "CREATED",
      actorUserId: user.id,
      metadata: { logisticsRequestId: request.publicId, acceptedQuoteId: quote.publicId },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: "SHIPMENT_CREATED",
      entityType: "Shipment",
      entityId: created.id,
      metadata: { logisticsRequestId: request.publicId, transportProviderId: provider.publicId, vehicleId: vehicle.publicId },
      ...meta,
    });
    trackEvent("shipment_created", user.id, { logisticsRequestId: request.publicId });

    return this.buildDTO(created);
  }

  // ---------------------------------------------------------------------
  // Step 7 — lifecycle transitions
  // ---------------------------------------------------------------------

  private async transitionOrThrow(
    user: AuthenticatedUserContext,
    shipmentPublicId: string,
    fromStatuses: import("@prisma/client").ShipmentStatus[],
    toStatus: import("@prisma/client").ShipmentStatus,
    eventType: import("@prisma/client").ShipmentEventType,
    auditAction: import("../audit/audit.service").AuditAction,
    extraData: Record<string, unknown> = {},
    meta?: RequestMeta,
  ): Promise<ShipmentRecord> {
    const shipment = await this.loadShipmentOrThrow(shipmentPublicId);
    const callerTransporterProfileId = await this.resolveCallerTransporterProfileId(user);
    this.authorization.assertCanOperate(user, shipment, callerTransporterProfileId);

    if (!fromStatuses.includes(shipment.status) || !canTransitionShipment(shipment.status, toStatus)) {
      throw new ShipmentDomainError(
        `Cannot move a shipment from ${shipment.status} to ${toStatus}.`,
        "INVALID_SHIPMENT_TRANSITION",
      );
    }

    const updated = await this.shipments.transition(shipment.id, fromStatuses, toStatus, extraData);
    if (!updated) {
      throw new ShipmentDomainError(
        `This shipment is no longer in a state that can move to ${toStatus}.`,
        "INVALID_SHIPMENT_TRANSITION",
      );
    }

    await this.events.create({
      shipmentId: shipment.id,
      eventType,
      previousStatus: shipment.status,
      newStatus: toStatus,
      actorUserId: user.id,
    });
    await this.audit.record({ actorUserId: user.id, action: auditAction, entityType: "Shipment", entityId: shipment.id, ...meta });

    return updated;
  }

  async confirm(user: AuthenticatedUserContext, shipmentPublicId: string, meta?: RequestMeta): Promise<ShipmentPublicDTO> {
    const updated = await this.transitionOrThrow(
      user,
      shipmentPublicId,
      ["CREATED"],
      "CONFIRMED",
      "SHIPMENT_CONFIRMED",
      "SHIPMENT_CONFIRMED",
      {},
      meta,
    );
    return this.buildDTO(updated);
  }

  /** Step 6 — attaches the single VehicleDriver record (if any) already
   * registered for this shipment's own vehicle. Advances CONFIRMED ->
   * ASSIGNED as a side effect; a no-op on the status for any later stage
   * (READY_FOR_PICKUP and beyond), so re-assigning never rewinds
   * progress. */
  async assignDriver(user: AuthenticatedUserContext, shipmentPublicId: string, meta?: RequestMeta): Promise<ShipmentPublicDTO> {
    const shipment = await this.loadShipmentOrThrow(shipmentPublicId);
    const callerTransporterProfileId = await this.resolveCallerTransporterProfileId(user);
    this.authorization.assertCanOperate(user, shipment, callerTransporterProfileId);

    if (isTerminalShipmentStatus(shipment.status)) {
      throw new ShipmentDomainError("Cannot assign a driver to a delivered or cancelled shipment.", "INVALID_SHIPMENT_TRANSITION");
    }

    const driver = await this.drivers.findByVehicleId(shipment.vehicleId);
    if (!driver) {
      throw new ShipmentDomainError("No driver is registered for this shipment's vehicle.", "DRIVER_NOT_FOUND", 404);
    }
    if (driver.transporterId !== shipment.transportProviderId) {
      throw new ShipmentDomainError("This driver does not belong to the assigned transport provider.", "DRIVER_NOT_ELIGIBLE", 403);
    }
    if (!driver.isActive) {
      throw new ShipmentDomainError("This driver is not currently active.", "DRIVER_NOT_ELIGIBLE");
    }

    let updated = await this.shipments.assignDriver(shipment.id, driver.id);
    if (updated.status === "CONFIRMED") {
      const transitioned = await this.shipments.transition(shipment.id, ["CONFIRMED"], "ASSIGNED");
      if (transitioned) updated = transitioned;
    }

    await this.events.create({
      shipmentId: shipment.id,
      eventType: "DRIVER_ASSIGNED",
      previousStatus: shipment.status,
      newStatus: updated.status,
      actorUserId: user.id,
    });
    await this.audit.record({
      actorUserId: user.id,
      action: "SHIPMENT_DRIVER_ASSIGNED",
      entityType: "Shipment",
      entityId: shipment.id,
      ...meta,
    });

    return this.buildDTO(updated);
  }

  async readyForPickup(user: AuthenticatedUserContext, shipmentPublicId: string, meta?: RequestMeta): Promise<ShipmentPublicDTO> {
    const updated = await this.transitionOrThrow(
      user,
      shipmentPublicId,
      ["CONFIRMED", "ASSIGNED"],
      "READY_FOR_PICKUP",
      "READY_FOR_PICKUP",
      "SHIPMENT_READY_FOR_PICKUP",
      {},
      meta,
    );
    return this.buildDTO(updated);
  }

  async pickup(user: AuthenticatedUserContext, shipmentPublicId: string, meta?: RequestMeta): Promise<ShipmentPublicDTO> {
    const updated = await this.transitionOrThrow(
      user,
      shipmentPublicId,
      ["READY_FOR_PICKUP"],
      "PICKED_UP",
      "PICKED_UP",
      "SHIPMENT_PICKED_UP",
      { actualPickupAt: new Date() },
      meta,
    );
    return this.buildDTO(updated);
  }

  async startTransit(user: AuthenticatedUserContext, shipmentPublicId: string, meta?: RequestMeta): Promise<ShipmentPublicDTO> {
    const updated = await this.transitionOrThrow(
      user,
      shipmentPublicId,
      ["PICKED_UP"],
      "IN_TRANSIT",
      "TRANSIT_STARTED",
      "SHIPMENT_TRANSIT_STARTED",
      {},
      meta,
    );
    // Step 19/21 — best-effort vehicle-availability flip, same
    // "never allowed to roll back an already-committed transition"
    // convention as LogisticsQuoteService.acceptQuote's own vehicle
    // reservation.
    try {
      await this.vehicles.updateAvailability(updated.vehicleId, "IN_TRANSIT");
    } catch {
      // Swallow — a real reconciliation job (or Module 18) should
      // re-derive availability from active shipments if this ever drifts.
    }
    return this.buildDTO(updated);
  }

  async arrive(user: AuthenticatedUserContext, shipmentPublicId: string, meta?: RequestMeta): Promise<ShipmentPublicDTO> {
    const updated = await this.transitionOrThrow(
      user,
      shipmentPublicId,
      ["IN_TRANSIT"],
      "ARRIVED",
      "ARRIVED",
      "SHIPMENT_ARRIVED",
      {},
      meta,
    );
    return this.buildDTO(updated);
  }

  async deliver(user: AuthenticatedUserContext, shipmentPublicId: string, meta?: RequestMeta): Promise<ShipmentPublicDTO> {
    const shipment = await this.loadShipmentOrThrow(shipmentPublicId);
    const callerTransporterProfileId = await this.resolveCallerTransporterProfileId(user);
    this.authorization.assertCanOperate(user, shipment, callerTransporterProfileId);

    const fromStatuses: import("@prisma/client").ShipmentStatus[] = ["IN_TRANSIT", "ARRIVED"];
    if (!fromStatuses.includes(shipment.status)) {
      throw new ShipmentDomainError(`Cannot move a shipment from ${shipment.status} to DELIVERED.`, "INVALID_SHIPMENT_TRANSITION");
    }
    const updated = await this.shipments.transition(shipment.id, fromStatuses, "DELIVERED", { actualDeliveryAt: new Date() });
    if (!updated) {
      throw new ShipmentDomainError("This shipment was already delivered or cancelled.", "INVALID_SHIPMENT_TRANSITION");
    }

    await this.events.create({
      shipmentId: shipment.id,
      eventType: "DELIVERED",
      previousStatus: shipment.status,
      newStatus: "DELIVERED",
      actorUserId: user.id,
    });
    await this.audit.record({ actorUserId: user.id, action: "SHIPMENT_DELIVERED", entityType: "Shipment", entityId: shipment.id, ...meta });
    trackEvent("shipment_delivered", user.id, {});

    // Step 20/21 — release the vehicle back to AVAILABLE, best-effort.
    try {
      await this.vehicles.updateAvailability(updated.vehicleId, "AVAILABLE");
    } catch {
      // Swallow — see startTransit's own comment.
    }

    return this.buildDTO(updated);
  }

  async cancel(
    user: AuthenticatedUserContext,
    shipmentPublicId: string,
    reason: string | undefined,
    meta?: RequestMeta,
  ): Promise<ShipmentPublicDTO> {
    const shipment = await this.loadShipmentOrThrow(shipmentPublicId);
    const lot = await this.loadLotOwnership(shipment.lotId);
    const callerFarmerProfileId = await this.resolveCallerFarmerProfileId(user);
    const callerTransporterProfileId = await this.resolveCallerTransporterProfileId(user);
    await this.authorization.assertCanCancel(user, shipment, lot, callerFarmerProfileId, callerTransporterProfileId);

    if (!CANCELLABLE_FROM_STATUSES.includes(shipment.status)) {
      throw new ShipmentDomainError(
        "A shipment can only be cancelled before it has been picked up.",
        "INVALID_SHIPMENT_TRANSITION",
      );
    }
    const updated = await this.shipments.transition(
      shipment.id,
      [...CANCELLABLE_FROM_STATUSES] as import("@prisma/client").ShipmentStatus[],
      "CANCELLED",
      { cancelledAt: new Date(), cancelReason: reason ?? null },
    );
    if (!updated) {
      throw new ShipmentDomainError("This shipment can no longer be cancelled.", "INVALID_SHIPMENT_TRANSITION");
    }

    await this.events.create({
      shipmentId: shipment.id,
      eventType: "CANCELLED",
      previousStatus: shipment.status,
      newStatus: "CANCELLED",
      actorUserId: user.id,
      metadata: reason ? { reason } : null,
    });
    await this.audit.record({
      actorUserId: user.id,
      action: "SHIPMENT_CANCELLED",
      entityType: "Shipment",
      entityId: shipment.id,
      metadata: reason ? { reason } : undefined,
      ...meta,
    });

    try {
      await this.vehicles.updateAvailability(updated.vehicleId, "AVAILABLE");
    } catch {
      // Swallow — see startTransit's own comment.
    }

    return this.buildDTO(updated);
  }

  // ---------------------------------------------------------------------
  // Step 9-15 — GPS location ingestion
  // ---------------------------------------------------------------------

  async submitLocation(
    user: AuthenticatedUserContext,
    shipmentPublicId: string,
    input: SubmitLocationInput,
    meta?: RequestMeta,
  ): Promise<ShipmentLocationPublicDTO> {
    const shipment = await this.loadShipmentOrThrow(shipmentPublicId);
    const callerTransporterProfileId = await this.resolveCallerTransporterProfileId(user);
    this.authorization.assertCanOperate(user, shipment, callerTransporterProfileId);

    if (!LOCATION_UPDATABLE_STATUSES.includes(shipment.status)) {
      const reason =
        shipment.status === "DELIVERED" || shipment.status === "CANCELLED"
          ? `This shipment is already ${shipment.status.toLowerCase()} and can no longer receive location updates.`
          : "This shipment has not been picked up yet — location updates start after pickup.";
      throw new ShipmentDomainError(reason, "SHIPMENT_NOT_TRACKABLE");
    }

    const recordedAt = input.recordedAt ?? new Date();
    const toleranceMs = getGpsFutureTimestampToleranceSeconds() * 1000;
    if (recordedAt.getTime() > Date.now() + toleranceMs) {
      throw new ShipmentDomainError("The recorded timestamp is too far in the future.", "INVALID_GPS_TIMESTAMP");
    }

    const created = await this.locations.create({
      shipmentId: shipment.id,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters ?? null,
      speedKmh: input.speedKmh ?? null,
      headingDegrees: input.headingDegrees ?? null,
      recordedAt,
      source: input.source,
    });

    const dto = this.toLocationPublicDTO(created);
    await setCachedLatestLocation(shipmentPublicId, dto);

    await this.events.create({
      shipmentId: shipment.id,
      eventType: "LOCATION_UPDATED",
      actorUserId: user.id,
      metadata: { latitude: input.latitude, longitude: input.longitude, source: input.source },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: "SHIPMENT_LOCATION_UPDATED",
      entityType: "Shipment",
      entityId: shipment.id,
      metadata: { source: input.source },
      ...meta,
    });

    return dto;
  }

  async listLocations(
    user: AuthenticatedUserContext,
    shipmentPublicId: string,
    filters: ListLocationsInput,
  ): Promise<{ items: ShipmentLocationPublicDTO[]; total: number; page: number; limit: number }> {
    const shipment = await this.loadShipmentOrThrow(shipmentPublicId);
    await this.assertCanView(user, shipment);

    const page = await this.locations.list({
      shipmentId: shipment.id,
      from: filters.from,
      to: filters.to,
      page: filters.page,
      limit: filters.limit,
    });

    return {
      items: page.items.map((row) => this.toLocationPublicDTO(row)),
      total: page.total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async getShipment(user: AuthenticatedUserContext, shipmentPublicId: string): Promise<ShipmentPublicDTO> {
    const shipment = await this.loadShipmentOrThrow(shipmentPublicId);
    await this.assertCanView(user, shipment);
    return this.buildDTO(shipment);
  }

  async getHandoff(user: AuthenticatedUserContext, shipmentPublicId: string): Promise<ShipmentHandoffDTO> {
    const shipment = await this.loadShipmentOrThrow(shipmentPublicId);
    await this.assertCanView(user, shipment);
    const provider = await this.transporters.findById(shipment.transportProviderId);
    const vehicle = await this.vehicles.findById(shipment.vehicleId);
    const quote = await this.logisticsQuotes.findById(shipment.acceptedQuoteId);
    const lot = await this.cropLots.findById(shipment.lotId);

    return {
      shipmentId: shipment.publicId,
      lotId: lot?.publicId ?? shipment.lotId,
      // Step 33 — Module 17 never performs delivery/quality reconciliation
      // itself, so "delivered quantity" is only ever known once Module 18
      // records it; here it is null until Module 18 exists.
      deliveredQuantity: null,
      expectedQuantity: decimalToNumber(shipment.quantityKg),
      quantityUnit: shipment.quantityUnit,
      pickupAt: shipment.actualPickupAt?.toISOString() ?? null,
      deliveryAt: shipment.actualDeliveryAt?.toISOString() ?? null,
      transportProviderId: provider?.publicId ?? shipment.transportProviderId,
      vehicleId: vehicle?.publicId ?? shipment.vehicleId,
      acceptedQuoteId: quote?.publicId ?? shipment.acceptedQuoteId,
      agreedAmount: decimalToNumber(shipment.agreedAmount),
      currency: shipment.currency,
      deliveryStatus: shipment.status,
    };
  }

  async listShipments(
    user: AuthenticatedUserContext,
    filters: ListShipmentsInput,
  ): Promise<{ items: ShipmentPublicDTO[]; total: number; page: number; limit: number }> {
    const repoFilters: ShipmentListFilters = { status: filters.status, page: filters.page, limit: filters.limit };

    if (user.role === "ADMIN") {
      if (filters.providerId) {
        const provider = await this.transporters.findByPublicId(filters.providerId);
        repoFilters.transportProviderId = provider?.id;
      }
      if (filters.vehicleId) {
        const vehicle = await this.vehicles.findByPublicId(filters.vehicleId);
        repoFilters.vehicleId = vehicle?.id;
      }
      if (filters.lotId) {
        const lot = await this.cropLots.findByPublicId(filters.lotId);
        repoFilters.lotId = lot?.id;
      }
    } else if (user.role === "TRANSPORTER") {
      // Step 8/26 — never a client-supplied providerId; always the
      // caller's own profile.
      const provider = await this.transporterAuthorization.resolveOwnProfile(user);
      repoFilters.transportProviderId = provider.id;
    } else if (user.role === "FARMER") {
      const profile = await this.farmerProfiles.ensure(user.id);
      const lots = await this.prisma.cropLot.findMany({ where: { farmerId: profile.id }, select: { id: true } });
      repoFilters.lotIds = lots.map((l) => l.id);
    } else if (user.role === "FPO_ADMIN") {
      const admins = await this.prisma.fpoAdmin.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { fpoId: true } });
      const fpoIds = admins.map((a) => a.fpoId);
      const lots = fpoIds.length ? await this.prisma.cropLot.findMany({ where: { fpoId: { in: fpoIds } }, select: { id: true } }) : [];
      repoFilters.lotIds = lots.map((l) => l.id);
    } else if (user.role === "BUYER") {
      const buyer = await this.prisma.buyerProfile.findUnique({ where: { userId: user.id } });
      const offers = buyer
        ? await this.prisma.tradeOffer.findMany({ where: { buyerId: buyer.id, status: "ACCEPTED" }, select: { lotId: true } })
        : [];
      repoFilters.lotIds = offers.map((o) => o.lotId);
    } else {
      repoFilters.lotIds = [];
    }

    const page = await this.shipments.list(repoFilters);
    return {
      items: await Promise.all(page.items.map((row) => this.buildDTO(row))),
      total: page.total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  // ---------------------------------------------------------------------
  // DTO building — ETA (Step 16) and route progress (Step 17)
  // ---------------------------------------------------------------------

  private toLocationPublicDTO(row: {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    speedKmh: number | null;
    headingDegrees: number | null;
    recordedAt: Date;
    source: import("@prisma/client").LocationUpdateSource;
  }): ShipmentLocationPublicDTO {
    return {
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyMeters: row.accuracyMeters,
      speedKmh: row.speedKmh,
      headingDegrees: row.headingDegrees,
      recordedAt: row.recordedAt.toISOString(),
      source: row.source,
    };
  }

  private async resolveLatestLocation(shipment: ShipmentRecord): Promise<LatestLocationDTO | null> {
    const cached = await getCachedLatestLocation(shipment.publicId);
    if (cached) return cached;
    const row = await this.locations.findLatest(shipment.id);
    if (!row) return null;
    const dto = this.toLocationPublicDTO(row);
    await setCachedLatestLocation(shipment.publicId, dto);
    return dto;
  }

  /** Step 16 — never presented as guaranteed. Recalculates only while the
   * shipment is an active trip with both a known latest location and a
   * known destination; otherwise falls back to the never-recalculated
   * initial figure handed off by Module 16. */
  private async buildEta(shipment: ShipmentRecord, latestLocation: LatestLocationDTO | null): Promise<ShipmentEtaDTO> {
    const initial: ShipmentEtaDTO = {
      type: "INITIAL_ESTIMATE",
      estimatedDeliveryAt: shipment.estimatedDeliveryAt?.toISOString() ?? null,
      estimatedDurationMinutes: shipment.estimatedDurationMinutes,
    };

    const isActiveTrip = shipment.status === "PICKED_UP" || shipment.status === "IN_TRANSIT" || shipment.status === "ARRIVED";
    if (!isActiveTrip || !latestLocation || shipment.destinationLatitude === null || shipment.destinationLongitude === null) {
      return initial;
    }

    const origin: GeoPoint = { latitude: latestLocation.latitude, longitude: latestLocation.longitude };
    const destination: GeoPoint = { latitude: shipment.destinationLatitude, longitude: shipment.destinationLongitude };
    const remaining = await this.routeDistanceProvider.estimateRoute(origin, destination);
    const recalculatedDeliveryAt = new Date(Date.now() + remaining.durationMinutes * 60 * 1000);

    return {
      type: "RECALCULATED_ESTIMATE",
      estimatedDeliveryAt: recalculatedDeliveryAt.toISOString(),
      estimatedDurationMinutes: remaining.durationMinutes,
    };
  }

  /** Step 17 — nullable whenever insufficient data exists; distances are
   * clearly typed rather than silently presented as road distance. */
  private buildRouteProgress(shipment: ShipmentRecord, latestLocation: LatestLocationDTO | null): ShipmentRouteProgressDTO {
    const estimatedDistanceKm = nullableDecimalToNumber(shipment.estimatedDistanceKm);

    let elapsedDistanceKm: number | null = null;
    if (latestLocation && shipment.pickupLatitude !== null && shipment.pickupLongitude !== null) {
      elapsedDistanceKm = haversineDistanceKm(
        { latitude: shipment.pickupLatitude, longitude: shipment.pickupLongitude },
        { latitude: latestLocation.latitude, longitude: latestLocation.longitude },
      );
    }

    let progressPercent: number | null = null;
    if (elapsedDistanceKm !== null && estimatedDistanceKm !== null && estimatedDistanceKm > 0) {
      progressPercent = Math.max(0, Math.min(100, Math.round((elapsedDistanceKm / estimatedDistanceKm) * 100)));
    }

    return {
      pickup: { latitude: shipment.pickupLatitude, longitude: shipment.pickupLongitude },
      destination: { latitude: shipment.destinationLatitude, longitude: shipment.destinationLongitude },
      latestLocation,
      estimatedDistanceKm,
      estimatedDistanceType: estimatedDistanceKm !== null ? "ROUTE_ESTIMATE" : null,
      elapsedDistanceKm,
      elapsedDistanceType: elapsedDistanceKm !== null ? "HAVERSINE" : null,
      progressPercent,
    };
  }

  private async buildDTO(shipment: ShipmentRecord): Promise<ShipmentPublicDTO> {
    const latestLocation = await this.resolveLatestLocation(shipment);
    const eta = await this.buildEta(shipment, latestLocation);
    const routeProgress = this.buildRouteProgress(shipment, latestLocation);

    return {
      shipmentId: shipment.publicId,
      logisticsRequestId: shipment.logisticsRequestId,
      acceptedQuoteId: shipment.acceptedQuoteId,
      lotId: shipment.lotId,
      transportProviderId: shipment.transportProviderId,
      vehicleId: shipment.vehicleId,
      driverId: shipment.driverId,
      commodity: shipment.commodity,
      quantity: decimalToNumber(shipment.quantityKg),
      quantityUnit: shipment.quantityUnit,
      pickup: {
        address: shipment.pickupAddress,
        district: shipment.pickupDistrict,
        state: shipment.pickupState,
        latitude: shipment.pickupLatitude,
        longitude: shipment.pickupLongitude,
      },
      destination: {
        address: shipment.destinationAddress,
        district: shipment.destinationDistrict,
        state: shipment.destinationState,
        latitude: shipment.destinationLatitude,
        longitude: shipment.destinationLongitude,
      },
      agreedAmount: decimalToNumber(shipment.agreedAmount),
      currency: shipment.currency,
      scheduledPickupAt: shipment.scheduledPickupAt?.toISOString() ?? null,
      actualPickupAt: shipment.actualPickupAt?.toISOString() ?? null,
      actualDeliveryAt: shipment.actualDeliveryAt?.toISOString() ?? null,
      status: shipment.status,
      cancelledAt: shipment.cancelledAt?.toISOString() ?? null,
      cancelReason: shipment.cancelReason,
      eta,
      latestLocation,
      routeProgress,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    };
  }
}
