/**
 * Module 21 — explicit Dispute state machine (Step 6). Pure and
 * side-effect free, same convention as deliveries/delivery-state-machine.ts:
 * the repository layer performs the actual atomic DB transition
 * (conditional updateMany keyed on the row's current status), this file
 * only answers "is X -> Y ever a legal transition".
 */

export type DisputeStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "INVESTIGATION"
  | "AWAITING_PARTY_RESPONSE"
  | "RESOLUTION_PROPOSED"
  | "RESOLVED"
  | "REJECTED"
  | "CLOSED"
  | "CANCELLED";

const ALLOWED_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  OPEN: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["INVESTIGATION", "AWAITING_PARTY_RESPONSE", "RESOLUTION_PROPOSED", "REJECTED", "CANCELLED"],
  INVESTIGATION: ["AWAITING_PARTY_RESPONSE", "RESOLUTION_PROPOSED", "REJECTED", "CANCELLED"],
  AWAITING_PARTY_RESPONSE: ["INVESTIGATION", "RESOLUTION_PROPOSED", "REJECTED", "CANCELLED"],
  RESOLUTION_PROPOSED: ["RESOLVED", "REJECTED", "INVESTIGATION"],
  RESOLVED: ["CLOSED"],
  REJECTED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

/** Step 18 — reopening never overwrites a CLOSED/RESOLVED/REJECTED status
 * in place; it is a distinct, explicitly-authorized transition back into
 * INVESTIGATION that the dispute-history event log always records as its
 * own REOPENED event (never silently folded into STATUS_CHANGED). */
const REOPENABLE_FROM: readonly DisputeStatus[] = ["CLOSED", "RESOLVED", "REJECTED"];

export function canTransitionDispute(from: DisputeStatus, to: DisputeStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canReopenDispute(from: DisputeStatus): boolean {
  return REOPENABLE_FROM.includes(from);
}

/** Step 18/19/28 — once a dispute is CLOSED or CANCELLED, nothing about it
 * may be further mutated (comments, evidence, assignment, status) except
 * through the explicit reopen workflow. */
export const TERMINAL_DISPUTE_STATUSES: readonly DisputeStatus[] = ["CLOSED", "CANCELLED"];

export function isTerminalDisputeStatus(status: DisputeStatus): boolean {
  return (TERMINAL_DISPUTE_STATUSES as string[]).includes(status);
}
