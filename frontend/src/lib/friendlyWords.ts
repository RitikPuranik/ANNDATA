/**
 * One place for farmer-friendly words.
 *
 * The backend speaks in codes like PARTIALLY_COMMITTED or READY_FOR_PICKUP.
 * A farmer should never see those. Every page uses these helpers so the same
 * thing is always called by the same easy name.
 */

const STATUS_WORDS: Record<string, string> = {
  // My crop for sale
  DRAFT: "Not for sale yet",
  AVAILABLE: "For sale",
  PARTIALLY_COMMITTED: "Part sold",
  COMMITTED: "Sold – waiting to send",
  STORED: "Kept in store",
  IN_TRANSACTION: "Sale in progress",
  DELIVERED: "Delivered",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",

  // Buyer offers
  SENT: "Waiting for reply",
  PENDING: "Waiting for reply",
  COUNTERED: "New price suggested",
  ACCEPTED: "Accepted",
  REJECTED: "Said no",
  WITHDRAWN: "Taken back",
  EXPIRED: "Time over",

  // Truck / delivery
  CREATED: "Booked",
  CONFIRMED: "Confirmed",
  ASSIGNED: "Truck found",
  READY_FOR_PICKUP: "Ready to load",
  PICKED_UP: "Loaded on truck",
  IN_TRANSIT: "On the way",
  ARRIVED: "Reached",

  // Truck request
  OPEN: "Waiting for truck prices",
  QUOTE_ACCEPTED: "Truck price accepted",

  // Truck price
  SUBMITTED: "Price received",

  // Payment
  PAID: "Paid",
  PARTIALLY_PAID: "Part paid",
  OVERPAID: "Paid extra",
  UNPAID: "Not paid yet",
  DISPUTED: "Problem raised",

  // Quality / checks
  VERIFIED: "Checked",
  ACTIVE: "Active",
  SUSPENDED: "Stopped",
  UNDER_REVIEW: "Being checked",
  INSUFFICIENT_DATA: "Not enough information",

  // Decision
  SELL_NOW: "Sell now",
  STORE: "Keep it stored",
};

/** "PARTIALLY_COMMITTED" -> "Part sold". Unknown codes become plain readable text. */
export function friendlyStatus(status: string | null | undefined): string {
  if (!status) return "";
  const known = STATUS_WORDS[status];
  if (known) return known;
  const plain = status.replace(/_/g, " ").toLowerCase();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** KG / QTL / TONNE -> words a farmer says every day. */
export function friendlyUnit(unit: string | null | undefined): string {
  switch ((unit ?? "").toUpperCase()) {
    case "KG":
      return "kg";
    case "QTL":
      return "quintal";
    case "TONNE":
    case "TON":
      return "tonne";
    default:
      return unit ?? "";
  }
}

/** "50 quintal" */
export function friendlyQuantity(value: number | string, unit: string | null | undefined): string {
  return `${value} ${friendlyUnit(unit)}`.trim();
}

/** ₹2,200 */
export function rupees(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Short date a farmer can read: 21 Sep 2026 */
export function friendlyDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Which offers are waiting for the farmer to answer. The server calls a new offer SENT. */
export function isOfferWaiting(status: string | null | undefined): boolean {
  return status === "SENT" || status === "PENDING" || status === "COUNTERED";
}

/** Grade letters explained. */
export function friendlyGrade(grade: string | null | undefined): string {
  switch (grade) {
    case "A":
      return "Very good";
    case "B":
      return "Good";
    case "C":
      return "Average";
    case "D":
      return "Below average";
    case "REJECTED":
      return "Not fit to sell";
    default:
      return grade ?? "";
  }
}
