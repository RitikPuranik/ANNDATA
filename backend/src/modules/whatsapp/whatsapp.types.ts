import type { AuthenticatedUserContext } from "../auth/auth.types";

export type Lang = "en" | "hi" | "hinglish";

/** Controlled intent set. The LLM (when enabled) may only ever pick from this list. */
export const INTENTS = [
  "FIND_BUYER",
  "CHECK_MANDI_PRICE",
  "VIEW_LOTS",
  "VIEW_OFFERS",
  "VIEW_PAYMENT",
  "VIEW_SHIPMENT",
  "HELP",
  "ABOUT",
  "CANCEL",
  "CONFIRM",
  "BACK",
  "WEBSITE",
  "UNKNOWN",
] as const;
export type Intent = (typeof INTENTS)[number];

export type QuantityUnitCode = "KG" | "QTL" | "TONNE";
export type GradeCode = "A" | "B" | "C" | "D" | "UNKNOWN";

/** Raw, untrusted entities as extracted from text (rules or LLM). */
export interface RawEntities {
  crop?: string;
  quantity?: number;
  unit?: QuantityUnitCode;
  location?: string;
  qualityGrade?: GradeCode;
}

export interface DetectedIntent {
  intent: Intent;
  entities: RawEntities;
  confidence: number;
  source: "command" | "rules" | "ai" | "none";
  /** For WEBSITE intents: which FarmLink page the request maps to. */
  websiteTarget?: WebsiteTarget;
}

export type WebsiteTarget =
  | "dashboard"
  | "warehouses"
  | "sellVsStore"
  | "forecasts"
  | "logistics"
  | "profile"
  | "transactions"
  | "register"
  | "farms"
  | "crops";

// ----------------------------------------------------------------------------
// Inbound / outbound message shapes
// ----------------------------------------------------------------------------

export type InboundType = "text" | "button" | "list" | "location" | "audio" | "image" | "unsupported";

export interface InboundMessage {
  externalId: string;
  /** Digits only incl. country code (Meta's wa_id / `from`). */
  from: string;
  timestamp: Date;
  type: InboundType;
  text?: string;
  /** Interactive reply id — one of OUR ids (e.g. "opt:2"); never trusted as a DB id. */
  actionId?: string;
  location?: { latitude: number; longitude: number; name?: string };
  mediaId?: string;
  profileName?: string;
}

export interface ButtonSpec {
  id: string;
  title: string;
}
export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export type OutboundMessage =
  | { kind: "text"; text: string }
  | { kind: "buttons"; body: string; buttons: ButtonSpec[] }
  | { kind: "list"; body: string; buttonText: string; rows: ListRow[]; sectionTitle?: string }
  | { kind: "cta_url"; body: string; displayText: string; url: string };

// ----------------------------------------------------------------------------
// Conversation
// ----------------------------------------------------------------------------

export type ConversationState =
  | "IDLE"
  | "COLLECTING_CROP"
  | "COLLECTING_QUANTITY"
  | "COLLECTING_LOCATION"
  | "COLLECTING_QUALITY"
  | "COLLECTING_FARM"
  | "COLLECTING_PRICE"
  | "AWAITING_CONFIRMATION"
  | "MATCHING"
  | "SHOWING_BUYERS"
  | "SHOWING_OFFERS"
  | "SHOWING_LOTS"
  | "SHOWING_PAYMENT"
  | "SHOWING_SHIPMENT";

export interface CropRef {
  id: string;
  name: string;
}

/** What the farmer has told us so far (persisted as `collectedEntities`). */
export interface CollectedEntities {
  crop?: CropRef;
  quantity?: number;
  unit?: QuantityUnitCode;
  location?: string;
  qualityGrade?: GradeCode;
  farmId?: string;
  /** Set once a lot exists for this flow — guards against creating it twice. */
  lotPublicId?: string;
  coords?: { latitude: number; longitude: number };
}

export interface OptionEntry {
  n: number;
  action: string;
  ref?: string;
}

export interface BuyerCard {
  demandPublicId: string;
  organizationName: string;
  district: string;
  state: string;
  requiredQuantity: number;
  quantityUnit: QuantityUnitCode;
  matchScore: number;
}

export type ConfirmKind = "CREATE_LOT" | "SEND_OFFER" | "ACCEPT_OFFER" | "REJECT_OFFER" | "COUNTER_OFFER" | "WITHDRAW_OFFER";

export interface ConversationContext {
  /** Server-side map of "what does reply N mean" — ids never travel in button ids. */
  options?: OptionEntry[];
  buyers?: BuyerCard[];
  buyerPage?: number;
  lotsPage?: number;
  offersPage?: number;
  /** A buyer picked for "details"/"offer" awaiting the next step. */
  pendingBuyerIndex?: number;
  pendingBuyerAction?: "details" | "offer";
  pendingOfferPublicId?: string;
  pendingPrice?: number;
  confirm?: { kind: ConfirmKind; ref?: string; price?: number; quantity?: number; unit?: QuantityUnitCode; buyerIndex?: number };
  /** What the current COLLECTING_* state is collecting for. */
  awaitingCropName?: boolean;
  /** Farmer chose "new lot" instead of reusing an existing matching lot. */
  declinedReuse?: boolean;
}

export interface ConversationRecord {
  id: string;
  phoneNumber: string;
  userId: string | null;
  state: ConversationState;
  intent: Intent | null;
  entities: CollectedEntities;
  context: ConversationContext;
  language: Lang;
  lastInboundAt: Date | null;
  expiresAt: Date;
}

export interface LinkedFarmer {
  user: AuthenticatedUserContext;
  fullName: string;
  phoneNumber: string;
}

/** A message from a number that is linked to a FarmLink farmer account. */
export interface FlowInput {
  inbound: InboundMessage;
  conv: ConversationRecord;
  farmer: LinkedFarmer;
}

/**
 * A message from a number that is NOT linked to any FarmLink account ("guest").
 * There is deliberately no `farmer` here: guest flows can only reach public
 * data (mandi prices, open buyer demand) and can never call a user-scoped
 * service. Anything that needs an account must narrow with `isLinked()` first,
 * so the compiler enforces the registered/unregistered boundary.
 */
export interface GuestFlowInput {
  inbound: InboundMessage;
  conv: ConversationRecord;
  farmer?: undefined;
}

export type AnyFlowInput = FlowInput | GuestFlowInput;

export const isLinked = (input: AnyFlowInput): input is FlowInput => input.farmer !== undefined;
