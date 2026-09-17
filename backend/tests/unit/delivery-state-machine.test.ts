import {
  IMMUTABLE_DELIVERY_STATUSES,
  INSPECTABLE_STATUSES,
  RECONCILABLE_STATUSES,
  canTransitionDelivery,
  isImmutableDeliveryStatus,
} from "../../src/modules/deliveries/delivery-state-machine";

describe("delivery state machine", () => {
  it("allows the full happy-path acceptance lifecycle", () => {
    expect(canTransitionDelivery("PENDING", "RECEIVED")).toBe(true);
    expect(canTransitionDelivery("RECEIVED", "UNDER_INSPECTION")).toBe(true);
    expect(canTransitionDelivery("UNDER_INSPECTION", "ACCEPTED")).toBe(true);
    expect(canTransitionDelivery("ACCEPTED", "RECONCILED")).toBe(true);
  });

  it("allows the partial-acceptance and rejection branches", () => {
    expect(canTransitionDelivery("UNDER_INSPECTION", "PARTIALLY_ACCEPTED")).toBe(true);
    expect(canTransitionDelivery("PARTIALLY_ACCEPTED", "RECONCILED")).toBe(true);
    expect(canTransitionDelivery("UNDER_INSPECTION", "REJECTED")).toBe(true);
    expect(canTransitionDelivery("REJECTED", "RECONCILED")).toBe(true);
  });

  it("never allows a decision to be made before UNDER_INSPECTION", () => {
    expect(canTransitionDelivery("PENDING", "ACCEPTED")).toBe(false);
    expect(canTransitionDelivery("RECEIVED", "ACCEPTED")).toBe(false);
    expect(canTransitionDelivery("RECEIVED", "REJECTED")).toBe(false);
  });

  it("never allows a transition out of RECONCILED (terminal)", () => {
    expect(canTransitionDelivery("RECONCILED", "ACCEPTED")).toBe(false);
    expect(canTransitionDelivery("RECONCILED", "UNDER_INSPECTION")).toBe(false);
    expect(canTransitionDelivery("RECONCILED", "PENDING")).toBe(false);
  });

  it("never allows skipping straight from UNDER_INSPECTION to RECONCILED without a decision", () => {
    expect(canTransitionDelivery("UNDER_INSPECTION", "RECONCILED")).toBe(false);
  });

  it("never allows two decisions on the same delivery (e.g. ACCEPTED -> REJECTED)", () => {
    expect(canTransitionDelivery("ACCEPTED", "REJECTED")).toBe(false);
    expect(canTransitionDelivery("REJECTED", "ACCEPTED")).toBe(false);
    expect(canTransitionDelivery("PARTIALLY_ACCEPTED", "ACCEPTED")).toBe(false);
  });

  it("IMMUTABLE_DELIVERY_STATUSES matches exactly ACCEPTED/REJECTED/RECONCILED", () => {
    expect([...IMMUTABLE_DELIVERY_STATUSES].sort()).toEqual(["ACCEPTED", "RECONCILED", "REJECTED"].sort());
    for (const status of IMMUTABLE_DELIVERY_STATUSES) {
      expect(isImmutableDeliveryStatus(status)).toBe(true);
    }
    expect(isImmutableDeliveryStatus("UNDER_INSPECTION")).toBe(false);
  });

  it("INSPECTABLE_STATUSES matches exactly RECEIVED/UNDER_INSPECTION", () => {
    expect([...INSPECTABLE_STATUSES].sort()).toEqual(["RECEIVED", "UNDER_INSPECTION"].sort());
  });

  it("RECONCILABLE_STATUSES matches exactly UNDER_INSPECTION", () => {
    expect([...RECONCILABLE_STATUSES]).toEqual(["UNDER_INSPECTION"]);
  });
});
