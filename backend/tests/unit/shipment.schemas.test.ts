import { submitLocationBody, listLocationsQuery, createShipmentBody } from "../../src/modules/shipments/shipment.schemas";

describe("shipment.schemas — submitLocationBody (Step 14: reject, never silently clamp)", () => {
  it("accepts a valid GPS payload and defaults source to DRIVER_APP", () => {
    const result = submitLocationBody.safeParse({ latitude: 22.5, longitude: 77.5 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.source).toBe("DRIVER_APP");
  });

  it("rejects an out-of-range latitude (e.g. 250)", () => {
    expect(submitLocationBody.safeParse({ latitude: 250, longitude: 77 }).success).toBe(false);
  });

  it("rejects an out-of-range longitude (e.g. -500)", () => {
    expect(submitLocationBody.safeParse({ latitude: 10, longitude: -500 }).success).toBe(false);
  });

  it("rejects negative speed", () => {
    expect(submitLocationBody.safeParse({ latitude: 10, longitude: 77, speedKmh: -5 }).success).toBe(false);
  });

  it("rejects heading of 360 or more (heading must be < 360)", () => {
    expect(submitLocationBody.safeParse({ latitude: 10, longitude: 77, headingDegrees: 360 }).success).toBe(false);
    expect(submitLocationBody.safeParse({ latitude: 10, longitude: 77, headingDegrees: 359.9 }).success).toBe(true);
  });

  it("rejects negative accuracy", () => {
    expect(submitLocationBody.safeParse({ latitude: 10, longitude: 77, accuracyMeters: -1 }).success).toBe(false);
  });

  it("rejects unknown top-level fields (privilege-escalation guard, same convention as every other module)", () => {
    expect(submitLocationBody.safeParse({ latitude: 10, longitude: 77, shipmentId: "hax" }).success).toBe(false);
  });
});

describe("shipment.schemas — createShipmentBody (Step 4: only a request reference is ever accepted)", () => {
  it("accepts a bare logisticsRequestId", () => {
    const result = createShipmentBody.safeParse({ logisticsRequestId: "11111111-1111-1111-1111-111111111111" });
    expect(result.success).toBe(true);
  });

  it("rejects client-supplied provider/vehicle/price/quantity fields", () => {
    const result = createShipmentBody.safeParse({
      logisticsRequestId: "11111111-1111-1111-1111-111111111111",
      transportProviderId: "22222222-2222-2222-2222-222222222222",
      agreedAmount: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("shipment.schemas — listLocationsQuery", () => {
  it("rejects a `from` after `to`", () => {
    const result = listLocationsQuery.safeParse({ from: "2026-01-02T00:00:00Z", to: "2026-01-01T00:00:00Z" });
    expect(result.success).toBe(false);
  });

  it("accepts a `from` before `to`", () => {
    const result = listLocationsQuery.safeParse({ from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z" });
    expect(result.success).toBe(true);
  });
});
