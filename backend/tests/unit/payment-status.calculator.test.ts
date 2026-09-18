import { calculatePayableAmount, recalculateObligationState } from "../../src/modules/payments/payment-status.calculator";

describe("calculatePayableAmount", () => {
  it("adds adjustments to the gross amount (Step 8)", () => {
    const result = calculatePayableAmount(100000, 0);
    expect(result).toBe(100000);
  });

  it("supports a negative adjustment (a shortage/quality deduction)", () => {
    const result = calculatePayableAmount(100000, -2500);
    expect(result).toBe(97500);
  });

  it("never uses native floating point — 0.1 + 0.2 style errors don't occur", () => {
    const result = calculatePayableAmount(0.1, 0.2);
    expect(result).toBe(0.3);
  });
});

describe("recalculateObligationState", () => {
  it("stays PENDING with amountDue = payable when nothing has been paid", () => {
    const state = recalculateObligationState(100000, [], "PENDING");
    expect(state.status).toBe("PENDING");
    expect(state.amountPaid).toBe(0);
    expect(state.amountDue).toBe(100000);
    expect(state.excessAmount).toBeNull();
  });

  it("becomes PARTIALLY_PAID once some but not all of the payable amount is paid", () => {
    const state = recalculateObligationState(100000, [40000], "PENDING");
    expect(state.status).toBe("PARTIALLY_PAID");
    expect(state.amountPaid).toBe(40000);
    expect(state.amountDue).toBe(60000);
  });

  it("sums multiple partial payments to reach PAID (Step 10's own worked example)", () => {
    const state = recalculateObligationState(100000, [40000, 30000, 30000], "PARTIALLY_PAID");
    expect(state.status).toBe("PAID");
    expect(state.amountPaid).toBe(100000);
    expect(state.amountDue).toBe(0);
    expect(state.excessAmount).toBeNull();
  });

  it("detects an overpayment and exposes the excess amount without capping it (Step 11)", () => {
    const state = recalculateObligationState(100000, [105000], "PENDING");
    expect(state.status).toBe("OVERPAID");
    expect(state.amountPaid).toBe(105000);
    expect(state.amountDue).toBe(0);
    expect(state.excessAmount).toBe(5000);
  });

  it("is idempotent with a Decimal-safe result when re-run with the exact same payments", () => {
    const state = recalculateObligationState(99999.99, [33333.33, 66666.66], "PARTIALLY_PAID");
    expect(state.status).toBe("PAID");
    expect(state.amountDue).toBe(0);
  });

  it("never recomputes a CANCELLED obligation's status away from CANCELLED", () => {
    const state = recalculateObligationState(100000, [40000], "CANCELLED");
    expect(state.status).toBe("CANCELLED");
  });

  it("never silently clears a DISPUTED status when a new payment is recalculated in", () => {
    const state = recalculateObligationState(100000, [40000], "DISPUTED");
    expect(state.status).toBe("DISPUTED");
  });
});
