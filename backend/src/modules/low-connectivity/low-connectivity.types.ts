// Module 23 (Part 1) — Low-Connectivity Offline Sync & Preloading.
//
// Shared TypeScript shapes for the sync engine (SyncSession/SyncPacket).
// These mirror prisma/schema.prisma's Module 23 models field-for-field —
// see PrismaLowConnectivitySyncRepository in low-connectivity.repository.ts
// for the mapping — so the service layer and its tests never depend on
// `@prisma/client` directly (same "repository returns a plain Record"
// convention every other module in this codebase already follows, e.g.
// DisputeRecord).

export type SyncSessionStatus = "OPEN" | "COMPLETED" | "ABANDONED";
export type SyncPacketStatus = "PENDING" | "PROCESSING" | "APPLIED" | "FAILED";

export interface SyncSessionRecord {
  id: string;
  publicId: string;
  userId: string;
  deviceId: string;
  status: SyncSessionStatus;
  clientAppVersion: string | null;
  networkProfile: string | null;
  lastAppliedSequence: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncPacketRecord {
  id: string;
  publicId: string;
  sessionId: string;
  userId: string;
  sequence: number;
  idempotencyKey: string;
  targetModule: string;
  action: string;
  payload: unknown;
  status: SyncPacketStatus;
  attempts: number;
  resultSummary: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  clientCreatedAt: Date;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StartSessionInput {
  deviceId: string;
  clientAppVersion?: string;
  networkProfile?: string;
}

export interface SubmitPacketInput {
  sequence: number;
  idempotencyKey: string;
  targetModule: string;
  action: string;
  payload: unknown;
  clientCreatedAt: Date;
}

export interface SyncSessionStatusView {
  session: SyncSessionRecord;
  packets: SyncPacketRecord[];
  counts: Record<SyncPacketStatus, number>;
}

/** Every possible section a preload bundle can be broken into — kept
 * small and independently fetchable (Section: chunked preloading for poor
 * connections), never one large payload the client is forced to fetch in
 * one shot. See preload-bundle.service.ts. */
export const PRELOAD_SECTIONS = ["profile", "reference", "market"] as const;
export type PreloadSection = (typeof PRELOAD_SECTIONS)[number];

export function isPreloadSection(value: string): value is PreloadSection {
  return (PRELOAD_SECTIONS as readonly string[]).includes(value);
}

export interface PreloadBundle {
  bundleVersion: string;
  generatedAt: string;
  sections: PreloadSection[];
  /** How long the client should trust this bundle before asking again,
   * scaled down for worse network profiles so a client on a good
   * connection re-syncs more eagerly while a client that just told us it
   * is OFFLINE/POOR_2G is encouraged to keep using its cached copy for
   * longer instead of burning its next window of connectivity re-fetching
   * the same thing. */
  ttlMinutes: number;
  profile?: PreloadProfileSection | null;
  reference?: PreloadReferenceSection;
  market?: PreloadMarketSection;
}

export interface PreloadProfileSection {
  user: {
    id: string;
    publicId: string;
    fullName: string;
    role: string;
    preferredLanguage: string;
  };
  farmerProfile: {
    id: string;
    fpoId: string | null;
    liquidityPreference: string | null;
    willingToStore: boolean | null;
  } | null;
}

export interface PreloadReferenceSection {
  states: Array<{ id: string; name: string }>;
  crops: Array<{ id: string; name: string; category: string | null }>;
}

export interface PreloadMarketSection {
  recentPrices: Array<{
    id: string;
    observedDate: string;
    modalPrice: string;
    cropName: string;
    mandiName: string;
  }>;
}
