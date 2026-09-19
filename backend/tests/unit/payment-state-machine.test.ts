import { canTransitionObligation, isObligationOverdue, isTerminalObligationStatus } from "../../src/modules/payments/payment-state-machine";

describe("payment-state-machine", () => {
  it("allows PENDING to move to PARTIALLY_PAID, PAID, OVERPAID, OVERDUE, CANCELLED, or DISPUTED", () => {
    for (const to of ["PARTIALLY_PAID", "PAID", "OVERPAID", "OVERDUE", "CANCELLED", "DISPUTED"] as const) {
      expect(canTransitionObligation("PENDING", to)).toBe(true);
    }
  });

  it("never allows a transition out of CANCELLED", () => {
    for (const to of ["PENDING", "PARTIALLY_PAID", "PAID", "OVERPAID", "OVERDUE", "DISPUTED"] as const) {
      expect(canTransitionObligation("CANCELLED", to)).toBe(false);
    }
  });

  it("treats CANCELLED as the only terminal status", () => {
    expect(isTerminalObligationStatus("CANCELLED")).toBe(true);
    expect(isTerminalObligationStatus("PAID")).toBe(false);
    expect(isTerminalObligationStatus("DISPUTED")).toBe(false);
  });

  it("allows PAID to move to OVERPAID or DISPUTED, but not back to PENDING", () => {
    expect(canTransitionObligation("PAID", "OVERPAID")).toBe(true);
    expect(canTransitionObligation("PAID", "DISPUTED")).toBe(true);
    expect(canTransitionObligation("PAID", "PENDING")).toBe(false);
  });

  it("allows DISPUTED to resolve back into any non-cancelled paid state", () => {
    expect(canTransitionObligation("DISPUTED", "PENDING")).toBe(true);
    expect(canTransitionObligation("DISPUTED", "PAID")).toBe(true);
    expect(canTransitionObligation("DISPUTED", "CANCELLED")).toBe(false);
  });

  describe("isObligationOverdue", () => {
    const now = new Date("2026-06-15T00:00:00Z");

    it("is overdue when dueAt has passed and amountDue > 0", () => {
      expect(isObligationOverdue("PENDING", new Date("2026-06-01T00:00:00Z"), 500, now)).toBe(true);
    });

    it("is never overdue when dueAt is null (Step 17)", () => {
      expect(isObligationOverdue("PENDING", null, 500, now)).toBe(false);
    });

    it("is never overdue when amountDue is 0", () => {
      expect(isObligationOverdue("PARTIALLY_PAID", new Date("2026-06-01T00:00:00Z"), 0, now)).toBe(false);
    });

    it("is never overdue when the due date is in the future", () => {
      expect(isObligationOverdue("PENDING", new Date("2026-07-01T00:00:00Z"), 500, now)).toBe(false);
    });

    it("never marks PAID, OVERPAID, or CANCELLED obligations overdue, no matter the due date (Step 18)", () => {
      const pastDue = new Date("2026-06-01T00:00:00Z");
      expect(isObligationOverdue("PAID", pastDue, 0, now)).toBe(false);
      expect(isObligationOverdue("OVERPAID", pastDue, 0, now)).toBe(false);
      expect(isObligationOverdue("CANCELLED", pastDue, 500, now)).toBe(false);
    });
  });
});
