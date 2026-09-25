/**
 * Human-facing dispute reference generation, mirroring
 * deliveries/delivery-number.ts and lots/lot-number.ts exactly:
 * "DSP-2026-000123" — unique, server-generated, never accepted as
 * authoritative from the client. The dispute's real API identity remains
 * `publicId`; this is only for display purposes.
 */

const SEQUENCE_WIDTH = 6;

export function buildDisputeNumber(year: number, sequence: number): string {
  return `DSP-${year}-${String(sequence).padStart(SEQUENCE_WIDTH, "0")}`;
}

/** Same "bump on unique-constraint retry" convention as
 * lots/lot-number.ts's nextLotNumberCandidate — handles the rare race
 * where two disputes are created for the same year in the same instant. */
export function nextDisputeNumberCandidate(year: number, baseSequence: number, attempt: number): string {
  return buildDisputeNumber(year, baseSequence + attempt);
}
