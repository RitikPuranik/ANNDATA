import { Money } from "../net-realization/net-realization-money";
import { PaymentObligationStatus } from "./payment-state-machine";

/**
 * Step 19/20 — PaymentStatusService's pure calculation core. Deliberately
 * has no Prisma dependency at all (no DB/HTTP calls, no @prisma/client
 * import), same "pure calculation engine" convention as
 * net-realization's own sell-vs-store-decision-engine and Module 18's
 * delivery-quantity-reconciliation.engine.ts — so it can be unit-tested
 * and reasoned about with zero infrastructure. Reuses net-realization's
 * own `Money` class for every amount (Step 20: "Use Prisma Decimal OR
 * the existing money abstraction" — Money is that existing abstraction,
 * and the only one in this codebase with zero Prisma dependency). Amounts
 * only leave `Money` (via `.toNumber()`) at this file's own boundary; the
 * repository layer passes those plain numbers straight into Prisma's
 * Decimal-typed columns (Prisma accepts number | string | Decimal for a
 * Decimal field, so no further conversion is needed there either).
 */

export interface ObligationAmountState {
  finalPayableAmount: number;
  amountPaid: number;
  amountDue: number;
  /** Step 11 — set only once amountPaid exceeds finalPayableAmount; never
   * derived from status alone. OVERDUE is layered on top of this
   * separately by isObligationOverdue() at read/decision time. */
  excessAmount: number | null;
  status: PaymentObligationStatus;
}

/**
 * Step 8 — finalPayableAmount = acceptedQuantity x agreedUnitPrice +
 * adjustments. Callers resolve acceptedQuantity/agreedUnitPrice from
 * Module 18's handoff themselves (Step 2: "never allow the frontend to
 * submit finalPayableAmount and trust it") — this function only combines
 * already-authoritative numbers, it never accepts a client-submitted
 * total.
 */
export function calculatePayableAmount(grossAmount: number, adjustments: number): number {
  return Money.fromRupees(grossAmount).add(Money.fromRupees(adjustments)).toNumber();
}

/**
 * Step 8 — acceptedQuantityKg x pricePerUnitRupees, where pricePerUnit is
 * expressed per `quantityUnitDivisorKg` kg (e.g. 100 for a per-quintal
 * price, 1 for a per-kg price). Kept as a single Money operation rather
 * than a separate "price per kg" division so the one unavoidable
 * fractional step (quantity / divisor) is rounded to the nearest paisa
 * exactly once, inside Money.multiplyRupeesByQuantity, never twice.
 */
export function calculateGrossAmount(pricePerUnitRupees: number, acceptedQuantityKg: number, quantityUnitDivisorKg: number): number {
  return Money.multiplyRupeesByQuantity(pricePerUnitRupees, acceptedQuantityKg / quantityUnitDivisorKg).toNumber();
}

/**
 * Step 10/11/13/20 — recomputes amountPaid/amountDue/excessAmount/status
 * from the obligation's finalPayableAmount and the full list of
 * non-reversed payment amounts recorded against it so far. Always
 * server-side, always from the full payment history — never an
 * incremental add that could drift (Step 22: concurrent recordings must
 * still land on the correct total no matter the interleaving, which this
 * function guarantees by recomputing from scratch every time it's called
 * inside the same DB transaction as the new payment row).
 */
export function recalculateObligationState(
  finalPayableAmount: number,
  activePaymentAmounts: number[],
  currentStatus: PaymentObligationStatus,
): ObligationAmountState {
  const payable = Money.fromRupees(finalPayableAmount);
  const paid = activePaymentAmounts.reduce((total, amount) => total.add(Money.fromRupees(amount)), Money.zero());

  if (currentStatus === "CANCELLED" || currentStatus === "DISPUTED") {
    // Step 4/19 — CANCELLED is terminal (never recomputed); DISPUTED is a
    // manually-entered hold that a payment recording must not silently
    // clear — an explicit resolution transition is required first.
    const due = payable.subtract(paid);
    return {
      finalPayableAmount: payable.toNumber(),
      amountPaid: paid.toNumber(),
      amountDue: due.isNegative() ? 0 : due.toNumber(),
      excessAmount: paid.greaterThan(payable) ? paid.subtract(payable).toNumber() : null,
      status: currentStatus,
    };
  }

  if (paid.greaterThan(payable)) {
    return {
      finalPayableAmount: payable.toNumber(),
      amountPaid: paid.toNumber(),
      amountDue: 0,
      excessAmount: paid.subtract(payable).toNumber(),
      status: "OVERPAID",
    };
  }

  const amountDue = payable.subtract(paid);
  if (amountDue.isZero()) {
    return { finalPayableAmount: payable.toNumber(), amountPaid: paid.toNumber(), amountDue: 0, excessAmount: null, status: "PAID" };
  }
  if (paid.isPositive()) {
    return {
      finalPayableAmount: payable.toNumber(),
      amountPaid: paid.toNumber(),
      amountDue: amountDue.toNumber(),
      excessAmount: null,
      status: "PARTIALLY_PAID",
    };
  }
  return {
    finalPayableAmount: payable.toNumber(),
    amountPaid: paid.toNumber(),
    amountDue: amountDue.toNumber(),
    excessAmount: null,
    status: "PENDING",
  };
}
