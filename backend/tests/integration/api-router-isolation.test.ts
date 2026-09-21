import request from "supertest";
import express from "express";

jest.mock("../../src/modules/auth/auth.utils", () => ({
  ...jest.requireActual("../../src/modules/auth/auth.utils"),
  verifyAccessToken: jest.fn().mockReturnValue({ sub: "user-1" }),
}));
jest.mock("../../src/config/posthog", () => ({ trackEvent: jest.fn() }));

import { createNetRealizationRouter } from "../../src/modules/net-realization/net-realization.routes";
import { createTransporterRouter } from "../../src/modules/transporters/transporter.routes";
import { createVehicleRouter } from "../../src/modules/transporters/vehicle.routes";
import { createLogisticsRequestRouter } from "../../src/modules/logistics/logistics-request.routes";
import { createLogisticsQuoteRouter } from "../../src/modules/logistics/logistics-quote.routes";
import { createShipmentRouter } from "../../src/modules/shipments/shipment.routes";
import { createDeliveryRouter } from "../../src/modules/deliveries/delivery.routes";
import { createPaymentRouter } from "../../src/modules/payments/payment.routes";
import { errorHandler } from "../../src/middleware/errorHandler";

/**
 * Regression test for a cross-router RBAC leak.
 *
 * Every module router below is mounted at the SAME "/api" prefix in app.ts.
 * A path-less `router.use(authMw, requireAnyRole(...))` inside one of them runs
 * for EVERY /api/* request that reaches it — including requests intended for
 * routers mounted AFTER it. Previously net-realization (FARMER/FPO_ADMIN/ADMIN)
 * and vehicles (TRANSPORTER/ADMIN) both did this, so together they returned
 * 403 to every role except ADMIN on /api/shipments, /api/deliveries,
 * /api/payments/*, /api/logistics/*.
 *
 * The per-module route tests mount each router in isolation and so could never
 * catch this. This test mounts them together, in the same order as app.ts.
 */
describe("routers sharing the /api prefix do not leak role guards onto each other", () => {
  let app: express.Express;
  let currentUser: { id: string; publicId: string; role: string };

  const page = { items: [], total: 0, page: 1, limit: 20 };
  const shipmentService = { listShipments: jest.fn().mockResolvedValue(page) };
  const deliveryService = { list: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
  const paymentService = { list: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
  const logisticsRequestService = { listRequests: jest.fn().mockResolvedValue(page) };

  const auth = "Bearer fake-valid-token";
  const as = (role: string) => {
    currentUser = { id: "user-1", publicId: "pub-user-1", role };
  };

  beforeEach(() => {
    as("FARMER");
    const authRepo: any = {
      findUserById: jest.fn().mockImplementation(() => Promise.resolve({ ...currentUser, accountStatus: "ACTIVE" })),
    };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    const stub: any = {};

    app = express();
    app.use(express.json());
    // Same relative order as src/app.ts.
    app.use("/api", createNetRealizationRouter(stub, stub, stub, stub, authRepo, audit));
    app.use("/api", createTransporterRouter(stub, authRepo, audit));
    app.use("/api", createVehicleRouter(stub, authRepo, audit));
    app.use("/api", createLogisticsRequestRouter(logisticsRequestService as any, authRepo, audit));
    app.use("/api", createLogisticsQuoteRouter(stub, authRepo, audit));
    app.use("/api", createShipmentRouter(shipmentService as any, authRepo, audit));
    app.use("/api", createDeliveryRouter(deliveryService as any, authRepo, audit));
    app.use("/api", createPaymentRouter(paymentService as any, authRepo, audit));
    app.use(errorHandler);
  });

  describe.each(["FARMER", "FPO_ADMIN", "BUYER", "TRANSPORTER", "ADMIN"])("as %s", (role) => {
    it("can list shipments (was 403 for everyone but ADMIN)", async () => {
      as(role);
      const res = await request(app).get("/api/shipments").set("Authorization", auth);
      expect(res.status).toBe(200);
    });

    it("can list deliveries", async () => {
      as(role);
      const res = await request(app).get("/api/deliveries").set("Authorization", auth);
      expect(res.status).toBe(200);
    });
  });

  it.each(["FARMER", "FPO_ADMIN", "BUYER", "ADMIN"])("%s can list payment obligations", async (role) => {
    as(role);
    const res = await request(app).get("/api/payments/obligations").set("Authorization", auth);
    expect(res.status).toBe(200);
  });

  it.each(["FARMER", "FPO_ADMIN", "ADMIN"])("%s can list logistics requests", async (role) => {
    as(role);
    const res = await request(app).get("/api/logistics/requests").set("Authorization", auth);
    expect(res.status).toBe(200);
  });

  describe("the guards still protect their OWN routes", () => {
    it.each(["FARMER", "FPO_ADMIN", "BUYER"])("%s cannot reach /api/vehicles", async (role) => {
      as(role);
      const res = await request(app).get("/api/vehicles").set("Authorization", auth);
      expect(res.status).toBe(403);
    });

    it("TRANSPORTER is allowed past the vehicles guard", async () => {
      as("TRANSPORTER");
      const res = await request(app).get("/api/vehicles").set("Authorization", auth);
      expect(res.status).not.toBe(403);
    });

    it.each(["BUYER", "TRANSPORTER"])("%s cannot reach net-realization", async (role) => {
      as(role);
      const a = await request(app)
        .get("/api/net-realization/11111111-1111-1111-1111-111111111111")
        .set("Authorization", auth);
      const b = await request(app)
        .get("/api/lots/11111111-1111-1111-1111-111111111111/net-realizations")
        .set("Authorization", auth);
      expect(a.status).toBe(403);
      expect(b.status).toBe(403);
    });

    it("an unauthenticated request is still rejected with 401", async () => {
      const res = await request(app).get("/api/shipments");
      expect(res.status).toBe(401);
    });
  });
});
