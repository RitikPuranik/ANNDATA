import { z } from "zod";

const networkProfile = z.enum(["OFFLINE", "POOR_2G", "SLOW_3G", "MODERATE", "GOOD"]);
export const startSyncSessionBody = z.object({ deviceId: z.string().min(1).max(150), clientAppVersion: z.string().max(40).optional(), networkProfile: networkProfile.optional() }).strict();
export const sessionPublicIdParams = z.object({ publicId: z.string().uuid() }).strict();
export const packetPublicIdParams = z.object({ publicId: z.string().uuid(), packetId: z.string().uuid() }).strict();
export const submitPacketBody = z.object({ sequence: z.coerce.number().int().positive(), idempotencyKey: z.string().min(8).max(150), targetModule: z.string().min(1).max(60), action: z.string().min(1).max(60), payload: z.record(z.string(), z.unknown()).refine(value => JSON.stringify(value).length <= 20000, "Payload must be 20KB or smaller."), clientCreatedAt: z.coerce.date() }).strict();
export const preloadBundleQuery = z.object({ sections: z.string().max(200).optional(), knownVersion: z.string().max(100).optional(), networkProfile: networkProfile.optional() }).strict();
