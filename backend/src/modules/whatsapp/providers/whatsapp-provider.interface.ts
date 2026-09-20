import type { ButtonSpec, ListRow } from "../whatsapp.types";

export interface SendResult {
  /** Provider's message id (Meta: wamid.*). */
  providerMessageId: string;
}

export interface TemplateMessage {
  name: string;
  languageCode: string;
  bodyParams?: string[];
}

export type InteractiveMessage =
  | { type: "buttons"; body: string; buttons: ButtonSpec[] }
  | { type: "cta_url"; body: string; displayText: string; url: string };

export interface ListMessage {
  body: string;
  buttonText: string;
  rows: ListRow[];
  sectionTitle?: string;
}

export type WebhookVerifyResult = { ok: true; challenge: string } | { ok: false };

/**
 * Provider-agnostic WhatsApp transport. Only MetaWhatsAppProvider exists today;
 * another provider (e.g. a BSP) can implement this without touching the
 * assistant logic.
 */
export interface WhatsAppProvider {
  readonly name: string;
  verifyWebhook(query: { mode?: string; token?: string; challenge?: string }): WebhookVerifyResult;
  /** Verifies the provider's request signature over the RAW request body. */
  verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
  sendTextMessage(to: string, text: string): Promise<SendResult>;
  sendInteractiveMessage(to: string, message: InteractiveMessage): Promise<SendResult>;
  sendListMessage(to: string, message: ListMessage): Promise<SendResult>;
  sendTemplateMessage(to: string, template: TemplateMessage): Promise<SendResult>;
  downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }>;
}

/** Sanitised provider failure — never carries tokens or raw provider bodies. */
export class WhatsAppProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WhatsAppProviderError";
  }
}
