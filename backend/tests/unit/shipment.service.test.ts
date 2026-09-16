import { ShipmentService } from "../../src/modules/shipments/shipment.service";
import { ShipmentDomainError } from "../../src/common/errors";
import { AuthenticatedUserContext } from "../../src/modules/auth/auth.types";

/**
 * Service-level tests against hand-rolled mocks for every collaborator
 * (no live Prisma client — see docs/modules/module-17-shipment-gps-tracking.md
 * for why: `binaries.prisma.sh` is unreachable from this sandbox). This
 * exercises the actual ShipmentService control flow (Step 4's duplicate
 * prevention, Step 3's invalid-transition rejection, Step 10's
 * not-trackable rejection) for real, without needing a generated client
 * or a live database.
 */

function farmerUser(): AuthenticatedUserContext {
  return { id: "user-farmer-1", publicId: "pub-user-farmer-1", role: "FARMER" };
}

function transporterUser(): AuthenticatedUserContext {
  return { id: "user-transporter-1", publicId: "pub-user-transporter-1", role: "TRANSPORTER" };
}

function buildService(overrides: Partial<Record<string, unknown>> = {}) {
  const shipments = {
    create: jest.fn(),
    findById: jest.fn(),
    findByPublicId: jest.fn(),
    findByLogisticsRequestId: jest.fn().mockResolvedValue(null),
    findByAcceptedQuoteId: jest.fn().mockResolvedValue(null),
    list: jest.fn(),
    assignDriver: jest.fn(),
    transition: jest.fn(),
    ...((overrides.shipments as object) ?? {}),
  };
  const locations = { create: jest.fn(), findLatest: jest.fn().mockResolvedValue(null), list: jest.fn() };
  const events = { create: jest.fn().mockResolvedValue({}), listByShipmentId: jest.fn() };
  const logisticsRequests = { findByPublicId: jest.fn(), findById: jest.fn() };
  const logisticsQuotes = { findById: jest.fn(), findByPublicId: jest.fn() };
  const cropLots = { findById: jest.fn(), findByPublicId: jest.fn() };
  const farmerProfiles = { ensure: jest.fn().mockResolvedValue({ id: "farmer-profile-1" }) };
  const transporters = { findById: jest.fn(), findByPublicId: jest.fn() };
  const vehicles = { findById: jest.fn(), findByPublicId: jest.fn(), updateAvailability: jest.fn().mockResolvedValue(undefined) };
  const drivers = { findByVehicleId: jest.fn().mockResolvedValue(null) };
  const transporterAuthorization = { resolveOwnProfile: jest.fn().mockRejectedValue(new Error("no profile")) };
  const authorization = {
    canView: jest.fn().mockResolvedValue(true),
    assertCanOperate: jest.fn(),
    assertCanCancel: jest.fn().mockResolvedValue(undefined),
  };
  const routeDistanceProvider = { estimateRoute: jest.fn(), calculateDistance: jest.fn(), calculateDuration: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    crop: { findUnique: jest.fn().mockResolvedValue({ name: "Wheat" }) },
    fpoAdmin: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    buyerProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    tradeOffer: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    cropLot: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const merged = {
    shipments,
    locations,
    events,
    logisticsRequests,
    logisticsQuotes,
    cropLots,
    farmerProfiles,
    transporters,
    vehicles,
    drivers,
    transporterAuthorization,
    authorization,
    routeDistanceProvider,
    audit,
    prisma,
    ...overrides,
  };

  const service = new ShipmentService(
    merged.shipments as never,
    merged.locations as never,
    merged.events as never,
    merged.logisticsRequests as never,
    merged.logisticsQuotes as never,
    merged.cropLots as never,
    merged.farmerProfiles as never,
    merged.transporters as never,
    merged.vehicles as never,
    merged.drivers as never,
    merged.transporterAuthorization as never,
    merged.authorization as never,
    merged.routeDistanceProvider as never,
    merged.audit as never,
    merged.prisma as never,
  );

  return { service, ...merged };
}

const baseRequest = {
  id: "req-1",
  publicId: "pub-req-1",
  requesterUserId: "user-farmer-1",
  lotId: "lot-1",
  cropId: "crop-1",
  status: "QUOTE_ACCEPTED",
  acceptedQuoteId: "quote-1",
  requiredQuantityKg: 1000,
  quantityUnit: "KG",
  pickupAddress: "Farm gate",
  pickupDistrict: "Bhopal",
  pickupState: "Madhya Pradesh",
  pickupLatitude: 23.25,
  pickupLongitude: 77.41,
  destinationAddress: "Mandi",
  destinationDistrict: "Indore",
  destinationState: "Madhya Pradesh",
  destinationLatitude: 22.71,
  destinationLongitude: 75.85,
  estimatedDistanceKm: 190,
  estimatedDurationMinutes: 240,
  requestedPickupAt: null,
  deliveryDeadline: null,
};

const baseQuote = {
  id: "quote-1",
  publicId: "pub-quote-1",
  status: "ACCEPTED",
  vehicleId: "vehicle-1",
  transportProviderId: "provider-1",
  quotedAmount: 5000,
  currency: "INR",
  estimatedDistanceKm: 190,
  estimatedDurationMinutes: 240,
  estimatedPickupTime: null,
  estimatedDeliveryTime: null,
};

const baseVehicle = { id: "vehicle-1", publicId: "pub-vehicle-1", transporterId: "provider-1", status: "ACTIVE" };
const baseProvider = { id: "provider-1", publicId: "pub-provider-1", isActive: true };
const baseLot = { id: "lot-1", publicId: "pub-lot-1", ownerType: "FARMER", farmerId: "farmer-profile-1", fpoId: null };

describe("ShipmentService.createFromAcceptedQuote", () => {
  it("creates a shipment from an accepted quote, deriving every field server-side", async () => {
    const { service, shipments, cropLots, logisticsRequests, logisticsQuotes, transporters, vehicles, events, audit } = buildService();
    (logisticsRequests.findByPublicId as jest.Mock).mockResolvedValue(baseRequest);
    (cropLots.findById as jest.Mock).mockResolvedValue(baseLot);
    (logisticsQuotes.findById as jest.Mock).mockResolvedValue(baseQuote);
    (vehicles.findById as jest.Mock).mockResolvedValue(baseVehicle);
    (transporters.findById as jest.Mock).mockResolvedValue(baseProvider);
    (shipments.create as jest.Mock).mockResolvedValue({
      id: "shipment-1",
      publicId: "pub-shipment-1",
      status: "CREATED",
      logisticsRequestId: "req-1",
      acceptedQuoteId: "quote-1",
      lotId: "lot-1",
      transportProviderId: "provider-1",
      vehicleId: "vehicle-1",
      driverId: null,
      commodity: "Wheat",
      quantityKg: 1000,
      quantityUnit: "KG",
      pickupAddress: "Farm gate",
      pickupDistrict: "Bhopal",
      pickupState: "Madhya Pradesh",
      pickupLatitude: 23.25,
      pickupLongitude: 77.41,
      destinationAddress: "Mandi",
      destinationDistrict: "Indore",
      destinationState: "Madhya Pradesh",
      destinationLatitude: 22.71,
      destinationLongitude: 75.85,
      agreedAmount: 5000,
      currency: "INR",
      estimatedDistanceKm: 190,
      estimatedDurationMinutes: 240,
      scheduledPickupAt: null,
      estimatedDeliveryAt: null,
      actualPickupAt: null,
      actualDeliveryAt: null,
      cancelledAt: null,
      cancelReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createFromAcceptedQuote(farmerUser(), { logisticsRequestId: "pub-req-1" });

    expect(shipments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        logisticsRequestId: "req-1",
        acceptedQuoteId: "quote-1",
        transportProviderId: "provider-1",
        vehicleId: "vehicle-1",
        commodity: "Wheat",
        agreedAmount: 5000,
      }),
    );
    expect(events.create).toHaveBeenCalledWith(expect.objectContaining({ eventType: "SHIPMENT_CREATED" }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SHIPMENT_CREATED" }));
    expect(result.shipmentId).toBe("pub-shipment-1");
    expect(result.status).toBe("CREATED");
  });

  it("rejects with SHIPMENT_ALREADY_EXISTS when the request already has a shipment (Step 4/28)", async () => {
    const { service, logisticsRequests, cropLots, logisticsQuotes, shipments } = buildService();
    (logisticsRequests.findByPublicId as jest.Mock).mockResolvedValue(baseRequest);
    (cropLots.findById as jest.Mock).mockResolvedValue(baseLot);
    (logisticsQuotes.findById as jest.Mock).mockResolvedValue(baseQuote);
    (shipments.findByLogisticsRequestId as jest.Mock).mockResolvedValue({ id: "existing-shipment" });

    await expect(service.createFromAcceptedQuote(farmerUser(), { logisticsRequestId: "pub-req-1" })).rejects.toMatchObject({
      code: "SHIPMENT_ALREADY_EXISTS",
    });
  });

  it("rejects with LOGISTICS_QUOTE_NOT_ACCEPTED when the request has no accepted quote yet", async () => {
    const { service, logisticsRequests, cropLots } = buildService();
    (logisticsRequests.findByPublicId as jest.Mock).mockResolvedValue({ ...baseRequest, status: "OPEN", acceptedQuoteId: null });
    (cropLots.findById as jest.Mock).mockResolvedValue(baseLot);

    await expect(service.createFromAcceptedQuote(farmerUser(), { logisticsRequestId: "pub-req-1" })).rejects.toMatchObject({
      code: "LOGISTICS_QUOTE_NOT_ACCEPTED",
    });
  });

  it("rejects a TRANSPORTER's attempt to create their own shipment", async () => {
    const { service, logisticsRequests, cropLots } = buildService();
    (logisticsRequests.findByPublicId as jest.Mock).mockResolvedValue(baseRequest);
    (cropLots.findById as jest.Mock).mockResolvedValue(baseLot);

    await expect(service.createFromAcceptedQuote(transporterUser(), { logisticsRequestId: "pub-req-1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED_SHIPMENT_ACCESS",
    });
  });
});

describe("ShipmentService lifecycle transitions", () => {
  it("rejects arrive() on an already-DELIVERED shipment (DELIVERED -> IN_TRANSIT/ARRIVED must fail)", async () => {
    const { service, shipments } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue({ id: "s1", publicId: "pub-s1", status: "DELIVERED" });

    await expect(service.arrive(transporterUser(), "pub-s1")).rejects.toBeInstanceOf(ShipmentDomainError);
    await expect(service.arrive(transporterUser(), "pub-s1")).rejects.toMatchObject({ code: "INVALID_SHIPMENT_TRANSITION" });
    expect(shipments.transition).not.toHaveBeenCalled();
  });

  it("only cancels from a pre-pickup status, never once PICKED_UP", async () => {
    const { service, shipments, cropLots } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue({ id: "s1", publicId: "pub-s1", status: "PICKED_UP", lotId: "lot-1" });
    (cropLots.findById as jest.Mock).mockResolvedValue(baseLot);

    await expect(service.cancel(transporterUser(), "pub-s1", undefined)).rejects.toMatchObject({
      code: "INVALID_SHIPMENT_TRANSITION",
    });
  });
});

describe("ShipmentService.submitLocation", () => {
  it("rejects a GPS update before the shipment has been picked up (Step 10)", async () => {
    const { service, shipments } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue({ id: "s1", publicId: "pub-s1", status: "CREATED" });

    await expect(
      service.submitLocation(transporterUser(), "pub-s1", { latitude: 23.2, longitude: 77.4, source: "DRIVER_APP" }),
    ).rejects.toMatchObject({ code: "SHIPMENT_NOT_TRACKABLE" });
  });

  it("rejects a GPS update once the shipment is DELIVERED", async () => {
    const { service, shipments } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue({ id: "s1", publicId: "pub-s1", status: "DELIVERED" });

    await expect(
      service.submitLocation(transporterUser(), "pub-s1", { latitude: 23.2, longitude: 77.4, source: "DRIVER_APP" }),
    ).rejects.toMatchObject({ code: "SHIPMENT_NOT_TRACKABLE" });
  });
});

describe("ShipmentService.assignDriver", () => {
  it("attaches the vehicle's own driver and advances CONFIRMED -> ASSIGNED as a side effect", async () => {
    const { service, shipments, drivers, events, audit } = buildService();
    const confirmedShipment = {
      id: "s1",
      publicId: "pub-s1",
      status: "CONFIRMED",
      vehicleId: "vehicle-1",
      transportProviderId: "provider-1",
      logisticsRequestId: "req-1",
      acceptedQuoteId: "quote-1",
      lotId: "lot-1",
      driverId: null,
      commodity: "Wheat",
      quantityKg: 1000,
      quantityUnit: "KG",
      pickupAddress: "Farm gate",
      pickupDistrict: "Bhopal",
      pickupState: "Madhya Pradesh",
      pickupLatitude: 23.25,
      pickupLongitude: 77.41,
      destinationAddress: "Mandi",
      destinationDistrict: "Indore",
      destinationState: "Madhya Pradesh",
      destinationLatitude: 22.71,
      destinationLongitude: 75.85,
      agreedAmount: 5000,
      currency: "INR",
      estimatedDistanceKm: 190,
      estimatedDurationMinutes: 240,
      scheduledPickupAt: null,
      estimatedDeliveryAt: null,
      actualPickupAt: null,
      actualDeliveryAt: null,
      cancelledAt: null,
      cancelReason: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };
    (shipments.findByPublicId as jest.Mock).mockResolvedValue(confirmedShipment);
    (drivers.findByVehicleId as jest.Mock).mockResolvedValue({
      id: "driver-1",
      vehicleId: "vehicle-1",
      transporterId: "provider-1",
      isActive: true,
    });
    (shipments.assignDriver as jest.Mock).mockResolvedValue({ ...confirmedShipment, driverId: "driver-1" });
    (shipments.transition as jest.Mock).mockResolvedValue({ ...confirmedShipment, driverId: "driver-1", status: "ASSIGNED" });

    const result = await service.assignDriver(transporterUser(), "pub-s1");

    expect(shipments.assignDriver).toHaveBeenCalledWith("s1", "driver-1");
    expect(shipments.transition).toHaveBeenCalledWith("s1", ["CONFIRMED"], "ASSIGNED");
    expect(events.create).toHaveBeenCalledWith(expect.objectContaining({ eventType: "DRIVER_ASSIGNED" }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SHIPMENT_DRIVER_ASSIGNED" }));
    expect(result.status).toBe("ASSIGNED");
    expect(result.driverId).toBe("driver-1");
  });

  it("rejects a driver belonging to a different provider", async () => {
    const { service, shipments, drivers } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue({
      id: "s1",
      publicId: "pub-s1",
      status: "CONFIRMED",
      vehicleId: "vehicle-1",
      transportProviderId: "provider-1",
    });
    (drivers.findByVehicleId as jest.Mock).mockResolvedValue({
      id: "driver-1",
      vehicleId: "vehicle-1",
      transporterId: "some-other-provider",
      isActive: true,
    });

    await expect(service.assignDriver(transporterUser(), "pub-s1")).rejects.toMatchObject({ code: "DRIVER_NOT_ELIGIBLE" });
  });

  it("rejects assigning a driver to an already-delivered shipment", async () => {
    const { service, shipments } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue({ id: "s1", publicId: "pub-s1", status: "DELIVERED" });

    await expect(service.assignDriver(transporterUser(), "pub-s1")).rejects.toMatchObject({ code: "INVALID_SHIPMENT_TRANSITION" });
  });
});

describe("ShipmentService happy-path lifecycle chain", () => {
  const shipment = (status: string) => ({
    id: "s1",
    publicId: "pub-s1",
    status,
    vehicleId: "vehicle-1",
    transportProviderId: "provider-1",
    logisticsRequestId: "req-1",
    acceptedQuoteId: "quote-1",
    lotId: "lot-1",
    driverId: null,
    commodity: "Wheat",
    quantityKg: 1000,
    quantityUnit: "KG",
    pickupAddress: "Farm gate",
    pickupDistrict: "Bhopal",
    pickupState: "Madhya Pradesh",
    pickupLatitude: 23.25,
    pickupLongitude: 77.41,
    destinationAddress: "Mandi",
    destinationDistrict: "Indore",
    destinationState: "Madhya Pradesh",
    destinationLatitude: 22.71,
    destinationLongitude: 75.85,
    agreedAmount: 5000,
    currency: "INR",
    estimatedDistanceKm: 190,
    estimatedDurationMinutes: 240,
    scheduledPickupAt: null,
    estimatedDeliveryAt: null,
    actualPickupAt: null,
    actualDeliveryAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });

  it("pickup: READY_FOR_PICKUP -> PICKED_UP records actualPickupAt and never touches vehicle availability", async () => {
    const { service, shipments, vehicles } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue(shipment("READY_FOR_PICKUP"));
    (shipments.transition as jest.Mock).mockResolvedValue(shipment("PICKED_UP"));

    const result = await service.pickup(transporterUser(), "pub-s1");

    expect(shipments.transition).toHaveBeenCalledWith(
      "s1",
      ["READY_FOR_PICKUP"],
      "PICKED_UP",
      expect.objectContaining({ actualPickupAt: expect.any(Date) }),
    );
    expect(vehicles.updateAvailability).not.toHaveBeenCalled();
    expect(result.status).toBe("PICKED_UP");
  });

  it("start-transit: PICKED_UP -> IN_TRANSIT flips the vehicle to IN_TRANSIT (best-effort)", async () => {
    const { service, shipments, vehicles } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue(shipment("PICKED_UP"));
    (shipments.transition as jest.Mock).mockResolvedValue(shipment("IN_TRANSIT"));

    const result = await service.startTransit(transporterUser(), "pub-s1");

    expect(vehicles.updateAvailability).toHaveBeenCalledWith("vehicle-1", "IN_TRANSIT");
    expect(result.status).toBe("IN_TRANSIT");
  });

  it("start-transit still succeeds even if the vehicle-availability update fails (best-effort, never blocking)", async () => {
    const { service, shipments, vehicles } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue(shipment("PICKED_UP"));
    (shipments.transition as jest.Mock).mockResolvedValue(shipment("IN_TRANSIT"));
    (vehicles.updateAvailability as jest.Mock).mockRejectedValue(new Error("vehicle row locked"));

    const result = await service.startTransit(transporterUser(), "pub-s1");
    expect(result.status).toBe("IN_TRANSIT");
  });

  it("deliver: IN_TRANSIT -> DELIVERED records actualDeliveryAt and releases the vehicle to AVAILABLE", async () => {
    const { service, shipments, vehicles, audit } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue(shipment("IN_TRANSIT"));
    (shipments.transition as jest.Mock).mockResolvedValue(shipment("DELIVERED"));

    const result = await service.deliver(transporterUser(), "pub-s1");

    expect(shipments.transition).toHaveBeenCalledWith(
      "s1",
      ["IN_TRANSIT", "ARRIVED"],
      "DELIVERED",
      expect.objectContaining({ actualDeliveryAt: expect.any(Date) }),
    );
    expect(vehicles.updateAvailability).toHaveBeenCalledWith("vehicle-1", "AVAILABLE");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SHIPMENT_DELIVERED" }));
    expect(result.status).toBe("DELIVERED");
  });

  it("deliver is also legal directly from ARRIVED", async () => {
    const { service, shipments } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue(shipment("ARRIVED"));
    (shipments.transition as jest.Mock).mockResolvedValue(shipment("DELIVERED"));

    const result = await service.deliver(transporterUser(), "pub-s1");
    expect(result.status).toBe("DELIVERED");
  });

  it("two concurrent delivery attempts: the loser sees transition() return null and gets a domain error, never a crash", async () => {
    const { service, shipments } = buildService();
    (shipments.findByPublicId as jest.Mock).mockResolvedValue(shipment("IN_TRANSIT"));
    (shipments.transition as jest.Mock).mockResolvedValue(null);

    await expect(service.deliver(transporterUser(), "pub-s1")).rejects.toMatchObject({ code: "INVALID_SHIPMENT_TRANSITION" });
  });
});

