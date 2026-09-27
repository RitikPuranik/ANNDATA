import {
  canReopenDispute,
  canTransitionDispute,
  isTerminalDisputeStatus,
  TERMINAL_DISPUTE_STATUSES,
} from "../../src/modules/disputes/dispute-state-machine";

describe("dispute state machine", () => {
  it("allows the full happy-path lifecycle", () => {
    expect(canTransitionDispute("OPEN", "UNDER_REVIEW")).toBe(true);
    expect(canTransitionDispute("UNDER_REVIEW", "INVESTIGATION")).toBe(true);
    expect(canTransitionDispute("INVESTIGATION", "RESOLUTION_PROPOSED")).toBe(true);
    expect(canTransitionDispute("RESOLUTION_PROPOSED", "RESOLVED")).toBe(true);
    expect(canTransitionDispute("RESOLVED", "CLOSED")).toBe(true);
  });

  it("allows the reject branch from review/investigation/awaiting-response/proposed", () => {
    expect(canTransitionDispute("UNDER_REVIEW", "REJECTED")).toBe(true);
    expect(canTransitionDispute("INVESTIGATION", "REJECTED")).toBe(true);
    expect(canTransitionDispute("AWAITING_PARTY_RESPONSE", "REJECTED")).toBe(true);
    expect(canTransitionDispute("RESOLUTION_PROPOSED", "REJECTED")).toBe(true);
    expect(canTransitionDispute("REJECTED", "CLOSED")).toBe(true);
  });

  it("allows OPEN/UNDER_REVIEW to be cancelled but nothing later", () => {
    expect(canTransitionDispute("OPEN", "CANCELLED")).toBe(true);
    expect(canTransitionDispute("UNDER_REVIEW", "CANCELLED")).toBe(true);
    expect(canTransitionDispute("INVESTIGATION", "CANCELLED")).toBe(true);
    expect(canTransitionDispute("RESOLVED", "CANCELLED")).toBe(false);
  });

  it("allows a proposed resolution to bounce back to further investigation", () => {
    expect(canTransitionDispute("RESOLUTION_PROPOSED", "INVESTIGATION")).toBe(true);
  });

  it("never allows skipping straight from OPEN to RESOLVED", () => {
    expect(canTransitionDispute("OPEN", "RESOLVED")).toBe(false);
    expect(canTransitionDispute("OPEN", "CLOSED")).toBe(false);
  });

  it("never allows a transition out of CLOSED/CANCELLED (terminal)", () => {
    expect(canTransitionDispute("CLOSED", "INVESTIGATION")).toBe(false);
    expect(canTransitionDispute("CANCELLED", "OPEN")).toBe(false);
  });

  it("never allows closing before RESOLVED/REJECTED", () => {
    expect(canTransitionDispute("INVESTIGATION", "CLOSED")).toBe(false);
    expect(canTransitionDispute("AWAITING_PARTY_RESPONSE", "CLOSED")).toBe(false);
  });

  it("TERMINAL_DISPUTE_STATUSES matches exactly CLOSED/CANCELLED", () => {
    expect([...TERMINAL_DISPUTE_STATUSES].sort()).toEqual(["CANCELLED", "CLOSED"].sort());
    for (const status of TERMINAL_DISPUTE_STATUSES) {
      expect(isTerminalDisputeStatus(status)).toBe(true);
    }
    expect(isTerminalDisputeStatus("RESOLVED")).toBe(false);
  });

  it("reopening is only allowed from CLOSED/RESOLVED/REJECTED", () => {
    expect(canReopenDispute("CLOSED")).toBe(true);
    expect(canReopenDispute("RESOLVED")).toBe(true);
    expect(canReopenDispute("REJECTED")).toBe(true);
    expect(canReopenDispute("OPEN")).toBe(false);
    expect(canReopenDispute("INVESTIGATION")).toBe(false);
    expect(canReopenDispute("CANCELLED")).toBe(false);
  });
});
