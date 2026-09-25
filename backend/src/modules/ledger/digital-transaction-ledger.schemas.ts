import { z } from "zod";

const publicId = z.string().uuid("This value is not valid.");

export const ledgerEntryPublicIdParams = z.object({ publicId }).strict();
export const ledgerTransactionIdParams = z.object({ transactionId: z.string().min(1).max(200) }).strict();
export const ledgerFarmerIdParams = z.object({ farmerId: publicId }).strict();
export const ledgerBuyerIdParams = z.object({ buyerId: publicId }).strict();

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const listLedgerQuery = z.object({ ...pagination }).strict();

/** Step: "Reversals" — a reason is required so a reversal always
 * explains the correction it represents (Step: never a silent edit). */
export const createReversalBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

/** Step: "Manual Adjustments" — amount/currency/reason/source-reference
 * are all required from the caller (an admin); createdBy/timestamp are
 * always resolved server-side from the authenticated session, never
 * accepted from the body. */
export const createManualAdjustmentBody = z
  .object({
    transactionId: z.string().min(1).max(200),
    tradeId: publicId.optional(),
    lotId: publicId.optional(),
    farmerId: publicId.optional(),
    buyerId: publicId.optional(),
    amount: z.number().finite().refine((v) => v !== 0, { message: "Amount cannot be zero." }),
    currency: z.string().trim().length(3).default("INR"),
    reason: z.string().trim().min(3).max(500),
    reference: z.string().trim().max(200).optional(),
  })
  .strict();
