import { DeliveryQualityResult, QualityGrade } from "@prisma/client";

/**
 * Step 6/7 — DeliveryQualityReconciliationEngine. Pure, deterministic, no
 * LLM (Step 34). Compares AGREED quality (resolved elsewhere — see
 * delivery-quality-agreement.resolver.ts — from the commercial
 * transaction's own BuyerDemand.qualityRequirements/grade, or Module 5's
 * QualityStandard rows as a fallback; never redefined by the frontend)
 * against the DELIVERED quality actually observed at inspection.
 *
 * Grading a single metric: `passed` is true when the observed value falls
 * within [expectedMin, expectedMax] (either bound may be absent). Grading
 * the overall parcel: PASS when every compared parameter (metrics + grade)
 * passes, FAIL when every compared parameter fails, PARTIAL otherwise —
 * a simple, explainable split rather than a weighted score (Step 7:
 * "make comparison deterministic and explainable"). PENDING is returned
 * only when there is nothing at all to compare (no agreed thresholds/grade
 * and no observations) — an honest "not evaluable" outcome, not a business
 * decision.
 */

// Best -> worst. Used only to decide whether a delivered grade meets or
// exceeds an agreed grade (Step 6: "Grade A / moisture <= 12%" example) —
// never used for anything beyond that same-or-better comparison.
const GRADE_RANK: Record<QualityGrade, number> = { A: 0, B: 1, C: 2, D: 3, REJECTED: 4 };

export interface AgreedMetricThreshold {
  metricCode: string;
  metricName: string;
  min: number | null;
  max: number | null;
}

export interface ObservedMetric {
  metricCode: string;
  metricName: string;
  value: number;
  unit: string | null;
}

export interface QualityReconciliationInput {
  agreedGrade: QualityGrade | null;
  agreedThresholds: AgreedMetricThreshold[];
  observedGrade: QualityGrade | null;
  observations: ObservedMetric[];
}

export interface QualityParameterResult {
  name: string;
  expected: string;
  actual: number | string;
  passed: boolean;
  variance: number | null;
  metricCode: string | null;
  expectedMin: number | null;
  expectedMax: number | null;
}

export interface QualityReconciliationResult {
  status: DeliveryQualityResult;
  parameters: QualityParameterResult[];
}

export class DeliveryQualityReconciliationEngine {
  reconcile(input: QualityReconciliationInput): QualityReconciliationResult {
    const parameters: QualityParameterResult[] = [];

    if (input.agreedGrade) {
      parameters.push(this.compareGrade(input.agreedGrade, input.observedGrade));
    }

    const thresholdByCode = new Map(input.agreedThresholds.map((t) => [t.metricCode, t]));
    for (const observation of input.observations) {
      const threshold = thresholdByCode.get(observation.metricCode) ?? null;
      parameters.push(this.compareMetric(observation, threshold));
    }

    if (parameters.length === 0) {
      return { status: "PENDING", parameters: [] };
    }

    const passedCount = parameters.filter((p) => p.passed).length;
    let status: DeliveryQualityResult;
    if (passedCount === parameters.length) status = "PASS";
    else if (passedCount === 0) status = "FAIL";
    else status = "PARTIAL";

    return { status, parameters };
  }

  private compareGrade(agreedGrade: QualityGrade, observedGrade: QualityGrade | null): QualityParameterResult {
    if (observedGrade === null) {
      return {
        name: "grade",
        expected: agreedGrade,
        actual: "NOT_OBSERVED",
        passed: false,
        variance: null,
        metricCode: null,
        expectedMin: null,
        expectedMax: null,
      };
    }
    const passed = GRADE_RANK[observedGrade] <= GRADE_RANK[agreedGrade];
    return {
      name: "grade",
      expected: agreedGrade,
      actual: observedGrade,
      passed,
      variance: GRADE_RANK[observedGrade] - GRADE_RANK[agreedGrade],
      metricCode: null,
      expectedMin: null,
      expectedMax: null,
    };
  }

  private compareMetric(observation: ObservedMetric, threshold: AgreedMetricThreshold | null): QualityParameterResult {
    if (!threshold || (threshold.min === null && threshold.max === null)) {
      // Step 4 — an observed metric with no agreed threshold is recorded
      // (Module 5 integration still captures it) but cannot be judged
      // pass/fail against nothing; it is neither counted as a pass nor a
      // failure of an agreed term, so it is reported as passed (no
      // violated agreement) with an explicit "no agreed threshold" note.
      return {
        name: observation.metricName,
        expected: "no agreed threshold",
        actual: observation.value,
        passed: true,
        variance: null,
        metricCode: observation.metricCode,
        expectedMin: null,
        expectedMax: null,
      };
    }

    const { min, max } = threshold;
    let passed = true;
    let variance: number | null = null;
    if (min !== null && observation.value < min) {
      passed = false;
      variance = round2(observation.value - min);
    }
    if (max !== null && observation.value > max) {
      passed = false;
      variance = round2(observation.value - max);
    }

    const expectedLabel =
      min !== null && max !== null
        ? `${min} - ${max}`
        : max !== null
          ? `<= ${max}`
          : min !== null
            ? `>= ${min}`
            : "no agreed threshold";

    return {
      name: observation.metricName,
      expected: expectedLabel,
      actual: observation.value,
      passed,
      variance,
      metricCode: observation.metricCode,
      expectedMin: min,
      expectedMax: max,
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
