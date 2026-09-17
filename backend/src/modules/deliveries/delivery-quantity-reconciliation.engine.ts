import { DeliveryQuantityResult } from "@prisma/client";

/**
 * Step 8/9 — DeliveryQuantityReconciliationEngine. Pure, deterministic,
 * no LLM (Step 34). Compares EXPECTED vs DELIVERED (and, once decided,
 * ACCEPTED) quantity using a configured tolerance band (Step 9): a
 * variance inside tolerance is EXACT even if the two numbers differ by a
 * few kg; outside tolerance it is SHORT (delivered < expected) or EXCESS
 * (delivered > expected) — the two are never conflated (Step 8: "Do not
 * incorrectly classify excess as shortage").
 */

export interface QuantityReconciliationInput {
  expectedQuantityKg: number;
  deliveredQuantityKg: number;
  tolerancePercent: number;
}

export interface QuantityReconciliationResult {
  expectedQuantityKg: number;
  deliveredQuantityKg: number;
  varianceKg: number;
  tolerancePercent: number;
  toleranceKg: number;
  result: DeliveryQuantityResult;
  shortageQuantityKg: number;
  excessQuantityKg: number;
}

export class DeliveryQuantityReconciliationEngine {
  reconcile(input: QuantityReconciliationInput): QuantityReconciliationResult {
    const { expectedQuantityKg, deliveredQuantityKg, tolerancePercent } = input;
    const toleranceKg = Math.abs(expectedQuantityKg) * (tolerancePercent / 100);
    // variance = delivered - expected, so a positive number always means
    // excess and a negative number always means shortage (Step 8's own
    // formula, `shortageQuantity = expected - delivered`, is just the
    // negation of this for the SHORT case below).
    const varianceKg = round2(deliveredQuantityKg - expectedQuantityKg);

    let result: DeliveryQuantityResult;
    if (Math.abs(varianceKg) <= toleranceKg) {
      result = "EXACT";
    } else if (varianceKg < 0) {
      result = "SHORT";
    } else {
      result = "EXCESS";
    }

    return {
      expectedQuantityKg,
      deliveredQuantityKg,
      varianceKg,
      tolerancePercent,
      toleranceKg: round2(toleranceKg),
      result,
      shortageQuantityKg: result === "SHORT" ? round2(expectedQuantityKg - deliveredQuantityKg) : 0,
      excessQuantityKg: result === "EXCESS" ? round2(deliveredQuantityKg - expectedQuantityKg) : 0,
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
