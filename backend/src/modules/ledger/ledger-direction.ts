import { LedgerDirection, LedgerEventType } from "@prisma/client";

/**
 * CREDIT: amount increases the farmer/seller's receivable balance for this
 * transaction. DEBIT: amount reduces it. This is the module's own
 * documentation of exactly what CREDIT/DEBIT mean (build spec requires an
 * unambiguous definition) — see the schema's LedgerDirection comment too.
 *
 * Only PAYMENT_OBLIGATION_CREATED, PAYMENT_RECORDED/PARTIAL_PAYMENT/
 * FINAL_PAYMENT, REFUND, REVERSAL and MANUAL_ADJUSTMENT affect the
 * reconstructed running balance (see calculateBalance() in the service) —
 * they map onto Module 19's own PaymentObligation.amountPaid/amountDue.
 * TRADE_VALUE_RECORDED/NET_REALIZATION_RECORDED/LOGISTICS_COST_RECORDED/
 * STORAGE_COST_RECORDED/OTHER_DEDUCTION_RECORDED/DELIVERY_ADJUSTMENT are
 * informational breakdown/context entries only (how Module 14/18 arrived
 * at the obligation's amount) — they still carry a direction reflecting
 * whether they are revenue-like or cost-like, but isBalanceAffecting()
 * below excludes them from balance reconstruction so nothing is double
 * counted against the obligation itself.
 */
const BALANCE_AFFECTING: ReadonlySet<LedgerEventType> = new Set([
  "PAYMENT_OBLIGATION_CREATED",
  "PAYMENT_RECORDED",
  "PARTIAL_PAYMENT",
  "FINAL_PAYMENT",
  "REFUND",
  "REVERSAL",
  "MANUAL_ADJUSTMENT",
]);

const DEFAULT_DIRECTION_BY_EVENT_TYPE: Readonly<Record<LedgerEventType, LedgerDirection>> = {
  TRADE_VALUE_RECORDED: "CREDIT",
  NET_REALIZATION_RECORDED: "CREDIT",
  LOGISTICS_COST_RECORDED: "DEBIT",
  STORAGE_COST_RECORDED: "DEBIT",
  OTHER_DEDUCTION_RECORDED: "DEBIT",
  DELIVERY_ADJUSTMENT: "DEBIT",
  PAYMENT_OBLIGATION_CREATED: "CREDIT",
  PAYMENT_RECORDED: "DEBIT",
  PARTIAL_PAYMENT: "DEBIT",
  FINAL_PAYMENT: "DEBIT",
  REFUND: "CREDIT",
  // REVERSAL/MANUAL_ADJUSTMENT have no fixed default — the caller always
  // supplies the direction explicitly (opposite of the entry being
  // reversed, or sign-of-amount for a manual adjustment).
  REVERSAL: "DEBIT",
  MANUAL_ADJUSTMENT: "DEBIT",
};

export function defaultDirectionFor(eventType: LedgerEventType): LedgerDirection {
  return DEFAULT_DIRECTION_BY_EVENT_TYPE[eventType];
}

export function isBalanceAffecting(eventType: LedgerEventType): boolean {
  return BALANCE_AFFECTING.has(eventType);
}

export function opposite(direction: LedgerDirection): LedgerDirection {
  return direction === "CREDIT" ? "DEBIT" : "CREDIT";
}

/** Signed contribution of one entry toward the reconstructed running
 * balance — CREDIT is positive, DEBIT is negative. Only meaningful for
 * balance-affecting event types (see isBalanceAffecting above). */
export function signedAmount(direction: LedgerDirection, amount: number): number {
  return direction === "CREDIT" ? amount : -amount;
}
