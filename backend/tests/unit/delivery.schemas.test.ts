import {
  createDeliveryBody,
  partialAcceptDeliveryBody,
  recordWeighmentBody,
  rejectDeliveryBody,
} from "../../src/modules/deliveries/delivery.schemas";

describe("delivery.schemas", () => {
  it("createDeliveryBody requires a shipmentId and rejects extra fields", () => {
    expect(createDeliveryBody.safeParse({ shipmentId: "11111111-1111-1111-1111-111111111111" }).success).toBe(true);
    expect(createDeliveryBody.safeParse({}).success).toBe(false);
    expect(
      createDeliveryBody.safeParse({ shipmentId: "11111111-1111-1111-1111-111111111111", lotId: "sneaky" }).success,
    ).toBe(false);
  });

  it("recordWeighmentBody rejects gross < tare (Step 3)", () => {
    const result = recordWeighmentBody.safeParse({ grossWeightKg: 10, tareWeightKg: 20 });
    expect(result.success).toBe(false);
  });

  it("recordWeighmentBody rejects a client-supplied netWeightKg field entirely (server always computes it)", () => {
    const result = recordWeighmentBody.safeParse({ grossWeightKg: 1020, tareWeightKg: 20, netWeightKg: 999 });
    expect(result.success).toBe(false);
  });

  it("recordWeighmentBody accepts a valid gross/tare pair and defaults method/unit", () => {
    const result = recordWeighmentBody.safeParse({ grossWeightKg: 1020, tareWeightKg: 20 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weighingMethod).toBe("WEIGHBRIDGE");
      expect(result.data.weightUnit).toBe("KG");
    }
  });

  it("partialAcceptDeliveryBody requires a positive acceptedQuantityKg", () => {
    expect(partialAcceptDeliveryBody.safeParse({ acceptedQuantityKg: 500 }).success).toBe(true);
    expect(partialAcceptDeliveryBody.safeParse({ acceptedQuantityKg: 0 }).success).toBe(false);
    expect(partialAcceptDeliveryBody.safeParse({ acceptedQuantityKg: -10 }).success).toBe(false);
    expect(partialAcceptDeliveryBody.safeParse({}).success).toBe(false);
  });

  it("rejectDeliveryBody requires a non-trivial reason", () => {
    expect(rejectDeliveryBody.safeParse({ reason: "Moisture far above agreed threshold" }).success).toBe(true);
    expect(rejectDeliveryBody.safeParse({ reason: "no" }).success).toBe(false);
    expect(rejectDeliveryBody.safeParse({}).success).toBe(false);
  });
});
