/**
 * Step 4/19 — explicit PaymentObligation state machine. Pure and
 * side-effect free, same convention as Module 18's own
 * delivery-state-machine.ts: the repository layer performs the actual
 * atomic DB transition (conditional updateMany), this file only answers
 * "is X -> Y ever a legal transition" and "which statuses are terminal".
 */

export type PaymentObligationStatus =
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERPAID"
  | "OVERDUE"
  | "CANCELLED"
  | "DISPUTED";

const ALLOWED_TRANSITIONS: Record<PaymentObligationStatus, PaymentObligationStatus[]> = {
  PENDING: ["PARTIALLY_PAID", "PAID", "OVERPAID", "OVERDUE", "CANCELLED", "DISPUTED"],
  PARTIALLY_PAID: ["PAID", "OVERPAID", "OVERDUE", "CANCELLED", "DISPUTED"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "OVERPAID", "DISPUTED"],
  PAID: ["OVERPAID", "DISPUTED"],
  OVERPAID: ["DISPUTED"],
  DISPUTED: ["PENDING", "PARTIALLY_PAID", "PAID", "OVERPAID"],
  CANCELLED: [],
};

/** Step 20 — once an obligation is CANCELLED, nothing may ever transition
 * it again (finalized/immutable, mirroring Module 18's
 * IMMUTABLE_DELIVERY_STATUSES). PAID/OVERPAID/DISPUTED remain mutable —
 * an overpayment can still move to DISPUTED, and a dispute can resolve
 * back into a paid state — but a cancellation is always final. */
export const TERMINAL_OBLIGATION_STATUSES: readonly PaymentObligationStatus[] = ["CANCELLED"];

export function isTerminalObligationStatus(status: PaymentObligationStatus): boolean {
  return (TERMINAL_OBLIGATION_STATUSES as string[]).includes(status);
}

export function canTransitionObligation(from: PaymentObligationStatus, to: PaymentObligationStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Step 18 — a payment is overdue only when amountDue > 0, dueAt exists,
 * and now > dueAt. Never marks a PAID/OVERPAID/CANCELLED obligation
 * overdue (Step 18: "Do not mark PAID obligations as overdue"). */
export function isObligationOverdue(status: PaymentObligationStatus, dueAt: Date | null, amountDue: number, now: Date): boolean {
  if (status === "PAID" || status === "OVERPAID" || status === "CANCELLED") return false;
  if (dueAt === null) return false;
  if (amountDue <= 0) return false;
  return now.getTime() > dueAt.getTime();
}
