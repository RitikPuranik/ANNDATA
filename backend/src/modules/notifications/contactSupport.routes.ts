import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { createEmailService } from "./email";
import { contactSupportEmailTemplate } from "./email/email.templates";

/**
 * Replaces the old browser -> EmailJS direct call (frontend/src/lib/emailjs.ts).
 * The "Contact support" widget now posts here; this route renders the
 * message with contactSupportEmailTemplate and sends it through whichever
 * EmailProvider is configured server-side (EmailJS or Resend, see
 * backend/src/modules/notifications/email/index.ts) — so the EmailJS
 * public key, service id and template id never need to ship to the
 * browser at all.
 *
 * Mount this router in app.ts alongside the other module routers, e.g.:
 *   app.use("/api/contact-support", contactSupportRouter);
 */

const contactSupportSchema = z.object({
  fromEmail: z.string().email("Enter a valid email address").max(320),
  message: z.string().min(1, "Message is required").max(5000),
  context: z.string().max(200).optional(),
  pageUrl: z.string().max(2000).optional(),
  // Simple honeypot field: real users never fill this in. Kept optional so
  // the route degrades gracefully if the frontend field is ever removed.
  website: z.string().max(0, "").optional(),
});

export const contactSupportRouter = Router();

// Reuses the same createEmailService() composition-root factory as the
// rest of the app (see notifications/email/index.ts) — same provider,
// same EMAIL_ENABLED gate, same MockEmailProvider fallback in dev/test.
const emailService = createEmailService();

contactSupportRouter.post("/", async (req, res) => {
  const parsed = contactSupportSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  // Honeypot tripped — pretend success so a bot doesn't learn anything,
  // but skip actually sending.
  if (parsed.data.website) {
    return res.status(202).json({ success: true });
  }

  const { fromEmail, message, context, pageUrl } = parsed.data;
  const rendered = contactSupportEmailTemplate({ fromEmail, message, context, pageUrl });

  const result = await emailService.sendEmail({
    to: env.CONTACT_SUPPORT_TO_EMAIL || env.EMAIL_FROM_ADDRESS,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo: fromEmail,
  });

  if (!result.success) {
    logger.error({ fromEmail, error: result.error }, "[contactSupportRouter] Failed to send support email");
    return res.status(502).json({ error: "Could not send your message. Please try again in a moment." });
  }

  return res.status(202).json({ success: true });
});
