/**
 * Human-facing delivery reference generation, mirroring
 * lots/lot-number.ts and quality/assessment-number.ts exactly:
 * "DEL-2026-000123" — unique, server-generated, never accepted as
 * authoritative from the client. The delivery's real API identity remains
 * `publicId`; this is only for display/slip purposes.
 */

const SEQUENCE_WIDTH = 6;

export function buildDeliveryNumber(year: number, sequence: number): string {
  return `DEL-${year}-${String(sequence).padStart(SEQUENCE_WIDTH, "0")}`;
}

/** Same "bump on unique-constraint retry" convention as
 * lots/lot-number.ts's nextLotNumberCandidate — handles the rare race
 * where two deliveries are created for the same year in the same instant. */
export function nextDeliveryNumberCandidate(year: number, baseSequence: number, attempt: number): string {
  return buildDeliveryNumber(year, baseSequence + attempt);
}
