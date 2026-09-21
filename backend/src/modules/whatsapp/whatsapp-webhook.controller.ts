import type { Request, Response } from "express";
import { sendError, sendSuccess } from "../../common/apiResponse";
import { logger } from "../../config/logger";
import type { RequestMeta } from "../auth/auth.types";
import { webhookVerifyQuerySchema, whatsappWebhookSchema } from "./whatsapp.schemas";
import type { WhatsAppFarmerService } from "./whatsapp-farmer.service";
import type { WhatsAppWebhookService } from "./whatsapp-webhook.service";

export interface WebhookControllerOptions {
  enabled: boolean;
  /** Tests await processing before responding; production processes after responding. */
  processInline?: boolean;
}

const meta = (req: Request): RequestMeta => ({ ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined });

export class WhatsAppWebhookController {
  constructor(
    private readonly service: WhatsAppWebhookService,
    private readonly opts: WebhookControllerOptions,
  ) {}

  /** GET /api/whatsapp/webhook — Meta's subscription handshake. */
  verify = (req: Request, res: Response): void => {
    if (!this.opts.enabled) {
      sendError(res, 503, "WHATSAPP_DISABLED", "WhatsApp integration is not enabled.");
      return;
    }
    const q = webhookVerifyQuerySchema.safeParse(req.query);
    if (!q.success) {
      sendError(res, 400, "INVALID_REQUEST", "Invalid verification request.");
      return;
    }
    const r = this.service.verifyWebhook({ mode: q.data["hub.mode"], token: q.data["hub.verify_token"], challenge: q.data["hub.challenge"] });
    if (!r.ok) {
      sendError(res, 403, "VERIFICATION_FAILED", "Webhook verification failed.");
      return;
    }
    // Meta expects the bare challenge string back.
    res.status(200).type("text/plain").send(r.challenge);
  };

  /** POST /api/whatsapp/webhook — incoming events. Body is the RAW bytes (express.raw). */
  receive = async (req: Request, res: Response): Promise<void> => {
    if (!this.opts.enabled) {
      sendError(res, 503, "WHATSAPP_DISABLED", "WhatsApp integration is not enabled.");
      return;
    }
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      sendError(res, 400, "INVALID_REQUEST", "Invalid request body.");
      return;
    }
    if (!this.service.verifySignature(raw, req.get("x-hub-signature-256") ?? undefined)) {
      logger.warn({ event: "invalid_signature" }, "[WhatsApp] invalid webhook signature");
      sendError(res, 401, "INVALID_SIGNATURE", "Invalid webhook signature.");
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw.toString("utf8"));
    } catch {
      sendError(res, 400, "INVALID_PAYLOAD", "Malformed webhook payload.");
      return;
    }
    const parsed = whatsappWebhookSchema.safeParse(json);
    if (!parsed.success) {
      sendError(res, 400, "INVALID_PAYLOAD", "Malformed webhook payload.");
      return;
    }

    let result;
    try {
      result = await this.service.ingest(parsed.data);
    } catch (err) {
      logger.error({ err: (err as Error).message }, "[WhatsApp] ingest failed");
      // 500 makes Meta retry delivery; idempotency makes the retry safe.
      sendError(res, 500, "INGEST_FAILED", "Could not record the event.");
      return;
    }

    if (this.opts.processInline) {
      await this.service.processMany(result.ids);
    } else {
      setImmediate(() => void this.service.processMany(result.ids));
    }
    sendSuccess(res, { accepted: result.accepted, duplicates: result.duplicates }, "Event received");
  };
}

/** Website-side account linking (authenticated farmer). */
export class WhatsAppAccountController {
  constructor(private readonly farmers: WhatsAppFarmerService, private readonly botNumber: string) {}

  issueCode = async (req: Request, res: Response): Promise<void> => {
    const { code, expiresAt } = await this.farmers.issueLinkCode(req.user!.id, meta(req));
    sendSuccess(res, { code, expiresAt, instruction: `Send "LINK ${code}" to ANNDATA's WhatsApp number${this.botNumber ? ` (${this.botNumber})` : ""}.` }, "WhatsApp link code created", 201);
  };

  status = async (req: Request, res: Response): Promise<void> => {
    sendSuccess(res, await this.farmers.status(req.user!.id));
  };

  unlink = async (req: Request, res: Response): Promise<void> => {
    const removed = await this.farmers.unlink(req.user!.id, meta(req));
    sendSuccess(res, { unlinked: removed });
  };
}
