import { env, isProduction } from "../../config/env";

export interface WhatsAppConfig {
  enabled: boolean;
  provider: "meta";
  apiBaseUrl: string;
  apiVersion: string;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  appSecret: string;
  timeoutMs: number;
  maxRetries: number;
  conversationTtlMinutes: number;
  maxMessageAgeSeconds: number;
  rateLimitPerMinute: number;
  aiRateLimitPerHour: number;
  matchingRateLimitPerHour: number;
  aiProvider: "none" | "gemini";
  geminiApiKey: string;
  geminiModel: string;
  geminiBaseUrl: string;
  aiTimeoutMs: number;
  devAutoLinkByMobile: boolean;
  frontendUrl: string;
}

export function loadWhatsAppConfig(): WhatsAppConfig {
  return {
    enabled: env.WHATSAPP_ENABLED,
    provider: env.WHATSAPP_PROVIDER,
    apiBaseUrl: env.WHATSAPP_API_BASE_URL,
    apiVersion: env.WHATSAPP_API_VERSION,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    webhookVerifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    appSecret: env.WHATSAPP_APP_SECRET,
    timeoutMs: env.WHATSAPP_TIMEOUT_MS,
    maxRetries: env.WHATSAPP_MAX_RETRIES,
    conversationTtlMinutes: env.WHATSAPP_CONVERSATION_TTL_MINUTES,
    maxMessageAgeSeconds: env.WHATSAPP_MAX_MESSAGE_AGE_SECONDS,
    rateLimitPerMinute: env.WHATSAPP_RATE_LIMIT_PER_MINUTE,
    aiRateLimitPerHour: env.WHATSAPP_AI_RATE_LIMIT_PER_HOUR,
    matchingRateLimitPerHour: env.WHATSAPP_MATCHING_RATE_LIMIT_PER_HOUR,
    aiProvider: env.WHATSAPP_AI_PROVIDER,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    geminiBaseUrl: env.GEMINI_API_BASE_URL,
    aiTimeoutMs: env.WHATSAPP_AI_TIMEOUT_MS,
    // Never honoured in production (see env.ts).
    devAutoLinkByMobile: env.WHATSAPP_DEV_AUTO_LINK_BY_MOBILE && !isProduction,
    frontendUrl: env.FRONTEND_URL,
  };
}
