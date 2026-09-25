import "dotenv/config";
import { z } from "zod";

// Feature flags that gate outbound network calls must parse "false" as false.
// (z.coerce.boolean() would turn the string "false" into `true`.)
const strictBoolean = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const envObjectSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be a long random string"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be a long random string"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be a long random string"),

  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().default(30),

  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BACKEND_URL: z.string().default("http://localhost:4000"),

  // Sign in with Google. The OAuth client's "Web application" client ID
  // from Google Cloud Console — shared with the frontend (it is not a
  // secret; the trust boundary is the audience check on the ID token
  // server-side, in google.service.ts). Left optional/empty so the rest
  // of the app boots fine in environments where Google sign-in isn't
  // configured yet; the /api/auth/google route itself rejects requests
  // when it's unset.
  GOOGLE_CLIENT_ID: z.string().optional().default(""),

  // Password recovery SMS OTP via Twilio Verify.
  TWILIO_ENABLED: strictBoolean,
  TWILIO_ACCOUNT_SID: z.string().optional().default(""),
  TWILIO_AUTH_TOKEN: z.string().optional().default(""),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional().default(""),
  TWILIO_VERIFY_BASE_URL: z.string().url().default("https://verify.twilio.com/v2"),
  TWILIO_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  REDIS_URL: z.string().optional(),

  POSTHOG_API_KEY: z.string().optional().default(""),
  POSTHOG_HOST: z.string().optional().default("https://app.posthog.com"),

  SENTRY_DSN: z.string().optional().default(""),

  // Leave blank for separate frontend/API hosts. Only set this when a shared\n  // parent cookie domain is intentionally required.\n  COOKIE_DOMAIN: z.string().optional().default(""),
  MARKET_SYNC_ENABLED: z.coerce.boolean().default(false),
  MARKET_DATA_GOV_API_KEY: z.string().optional().default(""),
  MARKET_DATA_GOV_RESOURCE_ID: z.string().optional().default(""),
  MARKET_DATA_GOV_BASE_URL: z.string().url().default("https://api.data.gov.in/resource"),
  MARKET_DATA_GOV_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  MARKET_DATA_GOV_PAGE_SIZE: z.coerce.number().int().min(1).max(1_000).default(500),
  MARKET_DATA_GOV_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  MARKET_DATA_GOV_RATE_LIMIT_MS: z.coerce.number().int().min(0).max(60_000).default(250),

  // Warehouse Ecosystem Ingestion Layer — government/private-partner
  // warehouse data sources. Both default to disabled/unconfigured: no
  // fake endpoint is ever assumed (see
  // UnavailableGovernmentWarehouseProvider / UnavailablePartnerWarehouseProvider).
  // A real provider implementation, when one exists, reads its own
  // endpoint/credential variables the same way DataGovMarketProvider reads
  // MARKET_DATA_GOV_* above — none are declared here speculatively.
  WAREHOUSE_GOVERNMENT_PROVIDER_ENABLED: z.coerce.boolean().default(false),
  // FCI/IISFM public government warehouse API.
  FCI_IISFM_API_BASE_URL: z.string().url().default("https://api.iisfm.nic.in"),
  FCI_IISFM_DEPOTS_ENDPOINT: z.string().min(1).default("/DepotsWithCap"),
  WAREHOUSE_GOVERNMENT_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  WAREHOUSE_GOVERNMENT_PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),

  WAREHOUSE_PARTNER_PROVIDER_ENABLED: z.coerce.boolean().default(false),
  WAREHOUSE_PARTNER_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  WAREHOUSE_PARTNER_PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),

  // Batch size for warehouse-sync.service.ts's per-provider persistence
  // loop — mirrors MARKET_DATA_GOV_PAGE_SIZE's role of keeping a single
  // sync run from opening one unbounded transaction.
  WAREHOUSE_SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),

  // Module 16 — Logistics Quote & Optimization. Every rate/weight below is
  // a starting default for development/test only (Step 4/9: "DO NOT
  // invent real-world Indian transport prices as permanent business
  // truth" / "these are starting defaults only") — an operator is
  // expected to tune them per deployment without a code change.
  LOGISTICS_ROAD_DISTANCE_MULTIPLIER: z.coerce.number().positive().default(1.25),
  LOGISTICS_AVERAGE_SPEED_KMPH: z.coerce.number().positive().default(35),

  LOGISTICS_BASE_COST_INR: z.coerce.number().min(0).default(500),
  LOGISTICS_RATE_PER_KM_INR: z.coerce.number().min(0).default(18),
  LOGISTICS_MINIMUM_TRIP_COST_INR: z.coerce.number().min(0).default(800),
  LOGISTICS_LOADING_COST_INR: z.coerce.number().min(0).default(200),
  LOGISTICS_UNLOADING_COST_INR: z.coerce.number().min(0).default(200),
  LOGISTICS_TOLL_ESTIMATE_PER_KM_INR: z.coerce.number().min(0).default(1.5),
  LOGISTICS_REFRIGERATION_SURCHARGE_PERCENT: z.coerce.number().min(0).max(100).default(15),

  // Optimization weights (Step 9) — must sum to 1 at the point of use;
  // LogisticsOptimizationEngine normalizes rather than trusting the sum
  // blindly (an operator could still misconfigure these).
  LOGISTICS_WEIGHT_PRICE: z.coerce.number().min(0).max(1).default(0.4),
  LOGISTICS_WEIGHT_DISTANCE: z.coerce.number().min(0).max(1).default(0.1),
  LOGISTICS_WEIGHT_TIME: z.coerce.number().min(0).max(1).default(0.2),
  LOGISTICS_WEIGHT_CAPACITY: z.coerce.number().min(0).max(1).default(0.15),
  LOGISTICS_WEIGHT_RELIABILITY: z.coerce.number().min(0).max(1).default(0.15),

  LOGISTICS_DEFAULT_QUOTE_VALIDITY_HOURS: z.coerce.number().int().positive().default(72),
  LOGISTICS_ROUTE_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(3600),
  LOGISTICS_COST_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(3600),

  // Module 17 — Shipment & GPS Tracking
  GPS_LOCATION_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(120),
  GPS_FUTURE_TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().min(0).default(120),
  SHIPMENT_LOCATION_MAX_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(100),

  // Module 18 — Delivery & Quality Reconciliation
  DELIVERY_QUANTITY_TOLERANCE_PERCENT: z.coerce.number().min(0).max(100).default(2),

  // WhatsApp Farmer Assistant (Meta WhatsApp Business Cloud API). Disabled by
  // default: with WHATSAPP_ENABLED=false no credentials are required, the
  // webhook answers 503, and no external WhatsApp/AI call is ever made.
  WHATSAPP_ENABLED: strictBoolean,
  WHATSAPP_PROVIDER: z.enum(["meta"]).default("meta"),
  WHATSAPP_API_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/, "e.g. v21.0").default("v21.0"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(""),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional().default(""),
  // The Meta *App Secret* — used only to verify the X-Hub-Signature-256 header
  // on incoming webhooks. Distinct from the access token.
  WHATSAPP_APP_SECRET: z.string().optional().default(""),
  WHATSAPP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  WHATSAPP_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
  WHATSAPP_CONVERSATION_TTL_MINUTES: z.coerce.number().int().min(1).max(1_440).default(30),
  // Webhook events older than this are acknowledged but not answered.
  WHATSAPP_MAX_MESSAGE_AGE_SECONDS: z.coerce.number().int().positive().default(21_600),
  WHATSAPP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  WHATSAPP_AI_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(0).default(30),
  WHATSAPP_MATCHING_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(0).default(20),
  // Optional natural-language layer. "none" = deterministic rules only.
  WHATSAPP_AI_PROVIDER: z.enum(["none", "gemini"]).default("none"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  GEMINI_API_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com"),
  WHATSAPP_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(6_000),
  // DEV/DEMO ONLY. When true (and NODE_ENV !== "production") a WhatsApp number
  // that equals a FARMER's registered mobile is auto-linked without the
  // website-issued code. Ignored in production, because User.mobile is not
  // OTP-verified and phone equality alone is not proof of identity.
  WHATSAPP_DEV_AUTO_LINK_BY_MOBILE: strictBoolean,

  // Transactional email (welcome, password reset, receipts). Disabled by
  // default: with EMAIL_ENABLED=false no API key is required and every
  // send is only logged (see MockEmailProvider) — mirrors the
  // WHATSAPP_ENABLED / WAREHOUSE_*_PROVIDER_ENABLED pattern above.
  EMAIL_ENABLED: strictBoolean,
  EMAIL_PROVIDER: z.enum(["emailjs"]).default("emailjs"),
  // Inbox that receives "Contact support" widget submissions
  // (see notifications/contactSupport.routes.ts). Falls back to
  // EMAIL_FROM_ADDRESS below if unset.
  CONTACT_SUPPORT_TO_EMAIL: z.string().optional().default(""),
  EMAIL_FROM_ADDRESS: z.string().default("notifications@anndata.app"),
  EMAIL_FROM_NAME: z.string().default("Anndata"),
  EMAIL_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  EMAIL_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  // EmailJS (https://www.emailjs.com) — used when EMAIL_PROVIDER="emailjs".
  // Same disabled-by-default posture as the rest of this block: these are
  // only required once EMAIL_ENABLED=true and EMAIL_PROVIDER=emailjs (see
  // superRefine below).
  EMAILJS_API_BASE_URL: z.string().url().default("https://api.emailjs.com"),
  EMAILJS_SERVICE_ID: z.string().optional().default(""),
  EMAILJS_TEMPLATE_ID: z.string().optional().default(""),
  EMAILJS_PUBLIC_KEY: z.string().optional().default(""),
  EMAILJS_PRIVATE_KEY: z.string().optional().default(""),
});

const envSchema = envObjectSchema.superRefine((value, ctx) => {
  if (value.TWILIO_ENABLED) {
    const required = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"] as const;
    for (const key of required) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when TWILIO_ENABLED=true`,
        });
      }
    }
  }
  if (value.WHATSAPP_ENABLED) {
    const required = [
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      "WHATSAPP_APP_SECRET",
    ] as const;
    for (const key of required) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when WHATSAPP_ENABLED=true`,
        });
      }
    }
  }
  if (value.WHATSAPP_ENABLED && value.WHATSAPP_AI_PROVIDER === "gemini" && !value.GEMINI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GEMINI_API_KEY"],
      message: "GEMINI_API_KEY is required when WHATSAPP_AI_PROVIDER=gemini",
    });
  }
  if (value.EMAIL_ENABLED && value.EMAIL_PROVIDER === "emailjs") {
    const required = ["EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY"] as const;
    for (const key of required) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when EMAIL_ENABLED=true and EMAIL_PROVIDER=emailjs`,
        });
      }
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Intentionally do not log process.env itself — only the validation issues.
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. Check .env against .env.example.");
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
