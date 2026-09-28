import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { PreloadBundle, PreloadSection } from "./low-connectivity.types";

export interface BuildPreloadOptions { sections?: PreloadSection[]; networkProfile?: string; knownVersion?: string; }

export function computeVersion(sections: Record<string, unknown>): string {
  return createHash("sha1").update(JSON.stringify(sections)).digest("hex");
}

export function ttlForNetworkProfile(profile?: string): number {
  switch (profile) {
    case "OFFLINE":
    case "POOR_2G": return 24 * 60;
    case "SLOW_3G": return 6 * 60;
    case "MODERATE": return 60;
    default: return 15;
  }
}

export class PreloadBundleService {
  constructor(private readonly prisma: PrismaClient) {}

  private async loadProfile(user: AuthenticatedUserContext) {
    const account = await this.prisma.user.findUnique({ where: { id: user.id }, select: { id: true, publicId: true, fullName: true, role: true, preferredLanguage: true } });
    if (!account) throw new Error("Authenticated user not found.");
    const farmerProfile = account.role === "FARMER" ? await this.prisma.farmerProfile.findUnique({ where: { userId: user.id }, select: { id: true, fpoId: true, liquidityPreference: true, willingToStore: true } }) : null;
    return { user: { id: account.id, publicId: account.publicId, fullName: account.fullName, role: account.role, preferredLanguage: account.preferredLanguage }, farmerProfile: farmerProfile ? { id: farmerProfile.id, fpoId: farmerProfile.fpoId, liquidityPreference: farmerProfile.liquidityPreference, willingToStore: farmerProfile.willingToStore } : null };
  }

  private async loadReference() {
    const [states, crops] = await Promise.all([
      this.prisma.state.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.crop.findMany({ where: { active: true }, take: 300, select: { id: true, name: true, category: true }, orderBy: { name: "asc" } }),
    ]);
    return { states, crops };
  }

  private async loadMarket() {
    const rows = await this.prisma.mandiPrice.findMany({ take: 50, orderBy: { observedDate: "desc" }, select: { id: true, observedDate: true, modalPrice: true, crop: { select: { name: true } }, mandi: { select: { name: true } } } });
    return { recentPrices: rows.map(row => ({ id: row.id, observedDate: row.observedDate.toISOString(), modalPrice: row.modalPrice.toString(), cropName: row.crop.name, mandiName: row.mandi.name })) };
  }

  async buildBundle(user: AuthenticatedUserContext, options: BuildPreloadOptions = {}): Promise<{ notModified: boolean; bundle?: PreloadBundle }> {
    const sections = options.sections?.length ? Array.from(new Set(options.sections)) : (["profile", "reference", "market"] as PreloadSection[]);
    const assembled: Record<string, unknown> = {};
    for (const section of sections) {
      if (section === "profile") assembled.profile = await this.loadProfile(user);
      if (section === "reference") assembled.reference = await this.loadReference();
      if (section === "market") assembled.market = await this.loadMarket();
    }
    const bundleVersion = computeVersion(assembled);
    if (options.knownVersion && options.knownVersion === bundleVersion) return { notModified: true };
    return { notModified: false, bundle: { bundleVersion, generatedAt: new Date().toISOString(), sections, ttlMinutes: ttlForNetworkProfile(options.networkProfile), ...assembled } as PreloadBundle };
  }
}
