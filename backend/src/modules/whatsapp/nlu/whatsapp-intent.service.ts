import { logger } from "../../../config/logger";
import { aiIntentResultSchema } from "../whatsapp.schemas";
import type { DetectedIntent, Lang } from "../whatsapp.types";
import type { WhatsAppRateLimiter } from "../whatsapp-rate-limiter";
import { parseMessage } from "./whatsapp-command-parser";
import type { WhatsAppNluProvider } from "./whatsapp-nlu.provider";

export const AI_MIN_CONFIDENCE = 0.6;

/**
 * Intent detection pipeline:
 *   known command / rule-matched phrase  → no LLM at all
 *   otherwise, if an NLU provider is configured and the farmer is under the
 *   hourly AI budget → LLM → Zod validation → confidence gate
 *   otherwise → UNKNOWN (caller shows the friendly menu + website fallback)
 * The LLM only ever returns an intent + entities; FarmLink's deterministic
 * services make every business decision.
 */
export class WhatsAppIntentService {
  constructor(
    private readonly nlu: WhatsAppNluProvider,
    private readonly limiter: WhatsAppRateLimiter,
    private readonly aiLimitPerHour: number,
  ) {}

  /** Cheap, deterministic, always safe to call. */
  parseDeterministic(text: string): DetectedIntent {
    return parseMessage(text);
  }

  async detect(text: string, opts: { language: Lang; rateKey: string }): Promise<DetectedIntent> {
    const rules = parseMessage(text);
    if (rules.intent !== "UNKNOWN") return rules;
    if (this.nlu.name === "none" || text.trim().length < 3) return rules;

    if (!(await this.limiter.allow(`ai:${opts.rateKey}`, this.aiLimitPerHour, 3600))) {
      logger.info({ event: "ai_rate_limited" }, "[WhatsApp] ai_rate_limited");
      return rules;
    }
    try {
      const raw = await this.nlu.extract(text, { language: opts.language });
      const parsed = aiIntentResultSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn({ event: "ai_invalid_output" }, "[WhatsApp] ai output failed validation");
        return rules;
      }
      if (parsed.data.confidence < AI_MIN_CONFIDENCE || parsed.data.intent === "UNKNOWN") {
        return { intent: "UNKNOWN", entities: parsed.data.entities, confidence: parsed.data.confidence, source: "ai" };
      }
      return { intent: parsed.data.intent, entities: parsed.data.entities, confidence: parsed.data.confidence, source: "ai" };
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[WhatsApp] ai provider error");
      return rules;
    }
  }
}
