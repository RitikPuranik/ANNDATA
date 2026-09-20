import { z } from "zod";
import { INTENTS } from "./whatsapp.types";

// ---------------------------------------------------------------------------
// Meta webhook payload. Deliberately lenient (passthrough) about fields we do
// not use — Meta adds fields over time — but strict about the ones we rely on.
// ---------------------------------------------------------------------------

const textSchema = z.object({ body: z.string() });
const interactiveSchema = z
  .object({
    type: z.string(),
    button_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
    list_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
  })
  .passthrough();
const locationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().optional(),
    address: z.string().optional(),
  })
  .passthrough();
const mediaSchema = z.object({ id: z.string(), mime_type: z.string().optional() }).passthrough();

export const waMessageSchema = z
  .object({
    id: z.string().min(1).max(256),
    from: z.string().regex(/^\d{6,20}$/, "invalid wa_id"),
    timestamp: z.string().regex(/^\d+$/),
    type: z.string().min(1),
    text: textSchema.optional(),
    interactive: interactiveSchema.optional(),
    location: locationSchema.optional(),
    audio: mediaSchema.optional(),
    voice: mediaSchema.optional(),
    image: mediaSchema.optional(),
  })
  .passthrough();

export const waStatusSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    recipient_id: z.string().optional(),
    timestamp: z.string().optional(),
  })
  .passthrough();

export const whatsappWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z.array(
          z.object({
            field: z.string(),
            value: z
              .object({
                messaging_product: z.string().optional(),
                metadata: z.object({ phone_number_id: z.string().optional() }).passthrough().optional(),
                contacts: z
                  .array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() }).passthrough())
                  .optional(),
                messages: z.array(waMessageSchema).optional(),
                statuses: z.array(waStatusSchema).optional(),
              })
              .passthrough(),
          }),
        ),
      }),
    )
    .max(50),
});
export type WhatsAppWebhookPayload = z.infer<typeof whatsappWebhookSchema>;

export const webhookVerifyQuerySchema = z.object({
  "hub.mode": z.string(),
  "hub.verify_token": z.string(),
  "hub.challenge": z.string().max(512),
});

// ---------------------------------------------------------------------------
// AI intent/entity result — NEVER trusted raw. Anything that fails this schema
// is treated as UNKNOWN.
// ---------------------------------------------------------------------------

export const aiIntentResultSchema = z
  .object({
    intent: z.enum(INTENTS),
    entities: z
      .object({
        crop: z.string().trim().min(1).max(60).optional(),
        quantity: z.number().finite().positive().max(1_000_000).optional(),
        unit: z.enum(["KG", "QTL", "TONNE"]).optional(),
        location: z.string().trim().min(1).max(80).optional(),
        qualityGrade: z.enum(["A", "B", "C", "D", "UNKNOWN"]).optional(),
      })
      .strict()
      .default({}),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type AiIntentResult = z.infer<typeof aiIntentResultSchema>;

// Account-linking endpoints (authenticated farmer, website side).
export const linkCodeResponseNote = "The code is shown once and expires in 10 minutes.";
