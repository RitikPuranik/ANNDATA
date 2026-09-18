import { z } from "zod";

const publicId = z.string().uuid("This value is not valid.");
const obligationStatus = z.enum(["PENDING", "PARTIALLY_PAID", "PAID", "OVERPAID", "OVERDUE", "CANCELLED", "DISPUTED"]);
const paymentMethod = z.enum(["BANK_TRANSFER", "UPI", "NEFT", "RTGS", "IMPS", "CASH", "CHEQUE", "OTHER"]);

export const paymentObligationPublicIdParams = z.object({ publicId }).strict();

/** Step 11 — the only client input to create an obligation is a reference
 * to the already-reconciled delivery; every commercial figure (quantity,
 * price, buyer, seller) is resolved server-side from Module 18's own
 * handoff, never from this body (Step 2). dueAt is the one field this
 * module has no authoritative source for (Step 17: no due-date concept
 * exists elsewhere in the schema) — an authorized caller may supply it
 * explicitly; omitting it leaves dueAt null, which can never become
 * OVERDUE. */
export const createPaymentObligationBody = z
  .object({
    deliveryId: publicId,
    dueAt: z.coerce.date().optional(),
  })
  .strict();

/** Step 16 — a reference string only; explicitly never a card number, CVV,
 * PIN, password, bank login credential, or UPI PIN (Step 16's own
 * prohibition). This is a best-effort shape check, not a guarantee — the
 * real protection is that this module never asks for or stores anything
 * resembling banking credentials in any field. */
const externalReference = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/^\d{12,19}$/.test(value.replace(/[\s-]/g, "")), {
    message: "This does not look like a valid payment reference.",
  })
  .optional();

/** Step 13/21 — amount/currency/status are the client's *claim* about a
 * payment that was made; the obligation's own amountPaid/amountDue/status
 * are always recalculated server-side from the full payment history, never
 * copied from this body. idempotencyKey is required so a network retry or
 * double-submit can never create a duplicate PaymentRecord (Step 21). */
export const recordPaymentBody = z
  .object({
    amount: z.coerce.number().positive("Payment amount must be greater than zero."),
    currency: z.string().trim().length(3).default("INR"),
    paymentMethod,
    idempotencyKey: z.string().trim().min(8).max(120),
    externalReference,
    paidAt: z.coerce.date().default(() => new Date()),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const markDisputedBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const cancelObligationBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const listPaymentObligationsQuery = z
  .object({
    status: obligationStatus.optional(),
    buyerId: publicId.optional(),
    sellerFarmerId: publicId.optional(),
    sellerFpoId: publicId.optional(),
    deliveryId: publicId.optional(),
    tradeOfferId: publicId.optional(),
    overdueOnly: z.coerce.boolean().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: "`from` must be on or before `to`.",
    path: ["to"],
  });

export const listPaymentRecordsQuery = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();
