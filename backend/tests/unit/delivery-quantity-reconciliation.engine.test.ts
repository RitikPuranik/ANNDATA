import { DeliveryQuantityReconciliationEngine } from "../../src/modules/deliveries/delivery-quantity-reconciliation.engine";

describe("DeliveryQuantityReconciliationEngine", () => {
  const engine = new DeliveryQuantityReconciliationEngine();

  it("classifies an exact match as EXACT with zero variance", () => {
    const result = engine.reconcile({ expectedQuantityKg: 1000, deliveredQuantityKg: 1000, tolerancePercent: 2 });
    expect(result.result).toBe("EXACT");
    expect(result.varianceKg).toBe(0);
    expect(result.shortageQuantityKg).toBe(0);
    expect(result.excessQuantityKg).toBe(0);
  });

  it("treats a shortage within tolerance as EXACT (build spec's own example: 1000 -> 995 @ 1% tolerance)", () => {
    const result = engine.reconcile({ expectedQuantityKg: 1000, deliveredQuantityKg: 995, tolerancePercent: 1 });
    expect(result.result).toBe("EXACT");
    expect(result.varianceKg).toBe(-5);
    expect(result.toleranceKg).toBe(10);
  });

  it("classifies a shortage beyond tolerance as SHORT and computes shortageQuantityKg (build spec's own example: 1000 -> 980)", () => {
    const result = engine.reconcile({ expectedQuantityKg: 1000, deliveredQuantityKg: 980, tolerancePercent: 1 });
    expect(result.result).toBe("SHORT");
    expect(result.shortageQuantityKg).toBe(20);
    expect(result.excessQuantityKg).toBe(0);
  });

  it("classifies an excess beyond tolerance as EXCESS and never as SHORT", () => {
    const result = engine.reconcile({ expectedQuantityKg: 1000, deliveredQuantityKg: 1050, tolerancePercent: 1 });
    expect(result.result).toBe("EXCESS");
    expect(result.excessQuantityKg).toBe(50);
    expect(result.shortageQuantityKg).toBe(0);
  });

  it("treats an excess within tolerance as EXACT", () => {
    const result = engine.reconcile({ expectedQuantityKg: 1000, deliveredQuantityKg: 1005, tolerancePercent: 1 });
    expect(result.result).toBe("EXACT");
  });

  it("is deterministic — the same input always produces the same output", () => {
    const input = { expectedQuantityKg: 500, deliveredQuantityKg: 470, tolerancePercent: 2 };
    const first = engine.reconcile(input);
    const second = engine.reconcile(input);
    expect(first).toEqual(second);
  });

  it("handles a zero tolerance band (exact-only)", () => {
    const result = engine.reconcile({ expectedQuantityKg: 1000, deliveredQuantityKg: 999.99, tolerancePercent: 0 });
    expect(result.result).toBe("SHORT");
  });
});
