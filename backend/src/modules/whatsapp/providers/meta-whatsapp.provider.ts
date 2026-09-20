import { createHmac, timingSafeEqual } from "crypto";
import type { WhatsAppConfig } from "../whatsapp.config";
import { truncate } from "../whatsapp-text";
import type { ButtonSpec, ListRow } from "../whatsapp.types";
import {
  WhatsAppProviderError,
  type InteractiveMessage,
  type ListMessage,
  type SendResult,
  type TemplateMessage,
  type WebhookVerifyResult,
  type WhatsAppProvider,
} from "./whatsapp-provider.interface";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// Meta Cloud API limits.
const LIMITS = { text: 4096, body: 1024, button: 20, rowTitle: 24, rowDesc: 72, listButton: 20, section: 24, ctaText: 20 };

const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

// ------- payload builders (exported for unit tests) -------

export const buildTextPayload = (to: string, text: string) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "text",
  text: { preview_url: false, body: truncate(text, LIMITS.text) },
});

export const buildButtonsPayload = (to: string, body: string, buttons: ButtonSpec[]) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: truncate(body, LIMITS.body) },
    action: {
      buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: truncate(b.title, LIMITS.button) } })),
    },
  },
});

export const buildCtaUrlPayload = (to: string, body: string, displayText: string, url: string) => ({
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to,
  type: "interactive",
  interactive: {
    type: "cta_url",
    body: { text: truncate(body, LIMITS.body) },
    action: { name: "cta_url", parameters: { display_text: truncate(displayText, LIMITS.ctaText), url } },
  },
});

export const buildListPayload = (to: string, m: ListMessage) => {
  const rows: ListRow[] = m.rows.slice(0, 10);
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: truncate(m.body, LIMITS.body) },
      action: {
        button: truncate(m.buttonText, LIMITS.listButton),
        sections: [
          {
            title: truncate(m.sectionTitle ?? "Options", LIMITS.section),
            rows: rows.map((r) => ({
              id: r.id.slice(0, 200),
              title: truncate(r.title, LIMITS.rowTitle),
              ...(r.description ? { description: truncate(r.description, LIMITS.rowDesc) } : {}),
            })),
          },
        ],
      },
    },
  };
};

export const buildTemplatePayload = (to: string, t: TemplateMessage) => ({
  messaging_product: "whatsapp",
  to,
  type: "template",
  template: {
    name: t.name,
    language: { code: t.languageCode },
    ...(t.bodyParams?.length
      ? { components: [{ type: "body", parameters: t.bodyParams.map((p) => ({ type: "text", text: p })) }] }
      : {}),
  },
});

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: WhatsAppConfig,
    fetchImpl?: FetchLike,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  verifyWebhook(q: { mode?: string; token?: string; challenge?: string }): WebhookVerifyResult {
    const expected = this.config.webhookVerifyToken;
    if (q.mode === "subscribe" && q.token && expected && q.challenge !== undefined && safeEqual(q.token, expected)) {
      return { ok: true, challenge: q.challenge };
    }
    return { ok: false };
  }

  verifySignature(rawBody: Buffer, header: string | undefined): boolean {
    if (!header || !this.config.appSecret) return false;
    const m = header.match(/^sha256=([0-9a-f]{64})$/i);
    if (!m) return false;
    const expected = createHmac("sha256", this.config.appSecret).update(rawBody).digest("hex");
    return safeEqual(m[1]!.toLowerCase(), expected);
  }

  sendTextMessage(to: string, text: string): Promise<SendResult> {
    return this.send(buildTextPayload(to, text));
  }

  sendInteractiveMessage(to: string, message: InteractiveMessage): Promise<SendResult> {
    return this.send(
      message.type === "buttons"
        ? buildButtonsPayload(to, message.body, message.buttons)
        : buildCtaUrlPayload(to, message.body, message.displayText, message.url),
    );
  }

  sendListMessage(to: string, message: ListMessage): Promise<SendResult> {
    return this.send(buildListPayload(to, message));
  }

  sendTemplateMessage(to: string, template: TemplateMessage): Promise<SendResult> {
    return this.send(buildTemplatePayload(to, template));
  }

  async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    const base = `${this.config.apiBaseUrl}/${this.config.apiVersion}`;
    const meta = await this.request(`${base}/${encodeURIComponent(mediaId)}`, { method: "GET" });
    const json = (await meta.json()) as { url?: string; mime_type?: string };
    if (!json.url) throw new WhatsAppProviderError("media url missing", "MEDIA_URL_MISSING", null, false);
    const file = await this.request(json.url, { method: "GET" });
    return { data: Buffer.from(await file.arrayBuffer()), mimeType: json.mime_type ?? "application/octet-stream" };
  }

  // ---------------------------------------------------------------------

  private async send(payload: unknown): Promise<SendResult> {
    const url = `${this.config.apiBaseUrl}/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;
    const res = await this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
    const id = json.messages?.[0]?.id;
    if (!id) throw new WhatsAppProviderError("provider returned no message id", "NO_MESSAGE_ID", res.status, false);
    return { providerMessageId: id };
  }

  /** HTTP with timeout + bounded retries on 429/5xx/network only. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    const attempts = this.config.maxRetries + 1;
    let lastError: WhatsAppProviderError | null = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${this.config.accessToken}` },
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        if (res.ok) return res;
        const retryable = res.status === 429 || res.status >= 500;
        // Only Meta's numeric error code/type are surfaced — never the body/token.
        let code = `HTTP_${res.status}`;
        try {
          const body = (await res.json()) as { error?: { code?: number; type?: string } };
          if (body.error?.code !== undefined) code = `META_${body.error.code}`;
        } catch {
          /* ignore body parse errors */
        }
        lastError = new WhatsAppProviderError(`WhatsApp provider request failed (${code})`, code, res.status, retryable);
        if (!retryable) throw lastError;
      } catch (err) {
        if (err instanceof WhatsAppProviderError) {
          if (!err.retryable) throw err;
          lastError = err;
        } else {
          lastError = new WhatsAppProviderError("WhatsApp provider network error", "NETWORK", null, true);
        }
      }
      if (attempt < attempts - 1) await this.sleep(Math.min(300 * 2 ** attempt, 3000));
    }
    throw lastError ?? new WhatsAppProviderError("WhatsApp provider request failed", "UNKNOWN", null, false);
  }
}
