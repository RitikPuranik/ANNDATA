import { DeliveryQualityReconciliationEngine } from "../../src/modules/deliveries/delivery-quality-reconciliation.engine";

describe("DeliveryQualityReconciliationEngine", () => {
  const engine = new DeliveryQualityReconciliationEngine();

  it("returns PENDING when there is nothing to compare (no agreed grade/thresholds, no observations)", () => {
    const result = engine.reconcile({ agreedGrade: null, agreedThresholds: [], observedGrade: null, observations: [] });
    expect(result.status).toBe("PENDING");
    expect(result.parameters).toHaveLength(0);
  });

  it("PASSes the build spec's own example: Grade A / moisture <= 12% agreed, delivered Grade A / moisture 11.4%", () => {
    const result = engine.reconcile({
      agreedGrade: "A",
      agreedThresholds: [{ metricCode: "moisture", metricName: "Moisture", min: null, max: 12 }],
      observedGrade: "A",
      observations: [{ metricCode: "moisture", metricName: "Moisture", value: 11.4, unit: "%" }],
    });
    expect(result.status).toBe("PASS");
    expect(result.parameters).toHaveLength(2);
    expect(result.parameters.every((p) => p.passed)).toBe(true);
  });

  it("FAILs when moisture is over the agreed max (build spec's own example: <=12% agreed, 15% delivered) and grade is not compared", () => {
    const result = engine.reconcile({
      agreedGrade: null,
      agreedThresholds: [{ metricCode: "moisture", metricName: "Moisture", min: null, max: 12 }],
      observedGrade: null,
      observations: [{ metricCode: "moisture", metricName: "Moisture", value: 15, unit: "%" }],
    });
    expect(result.status).toBe("FAIL");
    expect(result.parameters[0].passed).toBe(false);
    expect(result.parameters[0].variance).toBe(3);
  });

  it("returns PARTIAL when some parameters pass and others fail", () => {
    const result = engine.reconcile({
      agreedGrade: "A",
      agreedThresholds: [
        { metricCode: "moisture", metricName: "Moisture", min: null, max: 12 },
        { metricCode: "foreignMatter", metricName: "Foreign matter", min: null, max: 2 },
      ],
      observedGrade: "A",
      observations: [
        { metricCode: "moisture", metricName: "Moisture", value: 11, unit: "%" },
        { metricCode: "foreignMatter", metricName: "Foreign matter", value: 3.5, unit: "%" },
      ],
    });
    expect(result.status).toBe("PARTIAL");
  });

  it("passes a same-or-better delivered grade against the agreed grade", () => {
    const result = engine.reconcile({ agreedGrade: "B", agreedThresholds: [], observedGrade: "A", observations: [] });
    expect(result.parameters[0].passed).toBe(true);
  });

  it("fails a worse delivered grade than agreed", () => {
    const result = engine.reconcile({ agreedGrade: "A", agreedThresholds: [], observedGrade: "C", observations: [] });
    expect(result.parameters[0].passed).toBe(false);
  });

  it("fails when a grade was agreed but never observed", () => {
    const result = engine.reconcile({ agreedGrade: "A", agreedThresholds: [], observedGrade: null, observations: [] });
    expect(result.status).toBe("FAIL");
    expect(result.parameters[0].actual).toBe("NOT_OBSERVED");
  });

  it("records but does not fail an observed metric with no agreed threshold", () => {
    const result = engine.reconcile({
      agreedGrade: null,
      agreedThresholds: [],
      observedGrade: null,
      observations: [{ metricCode: "brokenGrains", metricName: "Broken grains", value: 4, unit: "%" }],
    });
    expect(result.status).toBe("PASS");
    expect(result.parameters[0].passed).toBe(true);
    expect(result.parameters[0].expected).toBe("no agreed threshold");
  });

  it("supports a minimum-bound threshold, not just a maximum", () => {
    const result = engine.reconcile({
      agreedGrade: null,
      agreedThresholds: [{ metricCode: "oilContent", metricName: "Oil content", min: 40, max: null }],
      observedGrade: null,
      observations: [{ metricCode: "oilContent", metricName: "Oil content", value: 35, unit: "%" }],
    });
    expect(result.status).toBe("FAIL");
    expect(result.parameters[0].variance).toBe(-5);
  });

  it("is deterministic — the same input always produces the same output", () => {
    const input = {
      agreedGrade: "A" as const,
      agreedThresholds: [{ metricCode: "moisture", metricName: "Moisture", min: null, max: 12 }],
      observedGrade: "B" as const,
      observations: [{ metricCode: "moisture", metricName: "Moisture", value: 13, unit: "%" }],
    };
    expect(engine.reconcile(input)).toEqual(engine.reconcile(input));
  });
});
