import type { PrismaClient } from "@prisma/client";
import type { CropDTO, ReferenceDataService } from "../reference-data/reference-data.service";
import type { FarmsRepository, FarmWithLocation } from "../farms/farms.repository";
import type { FarmerCropRepository } from "../crops/farmer-crop.repository";
import type { FarmerProfileResolver } from "../farmers/farmer-profile.resolver";
import { CROP_ALIASES } from "./nlu/whatsapp-command-parser";
import { levenshtein, normalizeText, tokenize } from "./whatsapp-text";
import type { Lang } from "./whatsapp.types";

const CACHE_MS = 5 * 60_000;

export interface ResolvedLocation {
  state: string | null;
  district: string | null;
  display: string;
}

/**
 * Crop and location understanding backed by ANNDATA's own data:
 *  - crops come from ReferenceDataService (Crop + CropTranslation tables) —
 *    nothing is hard-coded except Hinglish *aliases* that map words like "gehu"
 *    onto the canonical crop name.
 *  - locations are matched against the mandi table's districts/states (the
 *    data the price module actually has) and the farmer's own farms.
 */
export class WhatsAppCatalogService {
  private cropCache: { at: number; crops: CropDTO[] } | null = null;
  private locCache: { at: number; districts: Map<string, { display: string; state: string }>; states: Map<string, string> } | null = null;

  constructor(
    private readonly referenceData: ReferenceDataService,
    private readonly prisma: PrismaClient,
    private readonly farmsRepo: FarmsRepository,
    private readonly farmerCropRepo: FarmerCropRepository,
    private readonly profileResolver: FarmerProfileResolver,
  ) {}

  // ------------------------------- crops --------------------------------

  async listCrops(): Promise<CropDTO[]> {
    if (this.cropCache && Date.now() - this.cropCache.at < CACHE_MS) return this.cropCache.crops;
    const crops = await this.referenceData.listCrops();
    this.cropCache = { at: Date.now(), crops };
    return crops;
  }

  displayName(crop: CropDTO, lang: Lang): string {
    // Hindi uses the DB translation when present; otherwise the canonical name.
    // Hinglish/English keep the canonical English name (no risky translation).
    return (lang === "hi" ? crop.translations.hi : undefined) ?? crop.name;
  }

  async resolveCrop(text: string): Promise<CropDTO | null> {
    const n = normalizeText(text);
    if (!n) return null;
    const crops = await this.listCrops();
    const tokens = tokenize(n);

    const byName = (needle: string): CropDTO | undefined =>
      crops.find((c) => normalizeText(c.name) === needle) ??
      crops.find((c) => tokenize(normalizeText(c.name)).includes(needle)) ??
      crops.find((c) => normalizeText(c.name).startsWith(needle) && needle.length >= 4);

    for (const tok of tokens) {
      const viaAlias = CROP_ALIASES[tok];
      if (viaAlias) {
        const hit = byName(viaAlias);
        if (hit) return hit;
      }
    }
    const exact = byName(n);
    if (exact) return exact;
    for (const tok of tokens) {
      const hit = crops.find((c) => Object.values(c.translations).some((v) => v && normalizeText(v) === tok));
      if (hit) return hit;
    }
    // Typo tolerance on the canonical names (single-word input only).
    if (tokens.length === 1 && n.length >= 5) {
      const hit = crops.find((c) => levenshtein(normalizeText(c.name), n, 1) <= 1);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * Up to `max` crops for the menu: the farmer's own crops (linked farmers only —
   * pass null for a guest), then the most-listed, then A→Z.
   */
  async cropMenu(userId: string | null, max = 9): Promise<CropDTO[]> {
    const all = await this.listCrops();
    const byId = new Map(all.map((c) => [c.id, c]));
    const picked: CropDTO[] = [];
    const add = (id: string) => {
      const c = byId.get(id);
      if (c && !picked.includes(c)) picked.push(c);
    };
    if (userId) {
      try {
        const profile = await this.profileResolver.ensure(userId);
        const mine = await this.farmerCropRepo.findManyByFarmerProfileId(profile.id);
        mine.forEach((fc) => add(fc.cropId));
      } catch {
        /* menu still works without personalisation */
      }
    }
    try {
      const popular = await this.prisma.cropLot.groupBy({ by: ["cropId"], _count: { _all: true }, orderBy: { _count: { cropId: "desc" } }, take: 12 });
      popular.forEach((p) => add(p.cropId));
    } catch {
      /* ignore */
    }
    [...all].sort((a, b) => a.name.localeCompare(b.name)).forEach((c) => add(c.id));
    return picked.slice(0, max);
  }

  // ----------------------------- farms -----------------------------------

  async farmsOf(userId: string): Promise<FarmWithLocation[]> {
    const profile = await this.profileResolver.ensure(userId);
    return this.farmsRepo.findManyByFarmerProfileId(profile.id);
  }

  async farmerCropIds(userId: string): Promise<Set<string>> {
    const profile = await this.profileResolver.ensure(userId);
    const rows = await this.farmerCropRepo.findManyByFarmerProfileId(profile.id);
    return new Set(rows.map((r) => r.cropId));
  }

  async hasCropOnFarm(userId: string, farmId: string, cropId: string): Promise<boolean> {
    const profile = await this.profileResolver.ensure(userId);
    const rows = await this.farmerCropRepo.findManyByFarmerProfileId(profile.id);
    return rows.some((r) => r.farmId === farmId && r.cropId === cropId);
  }

  farmLabel(farm: FarmWithLocation): string {
    return [farm.village, farm.district.name].filter(Boolean).join(", ");
  }

  /** Farms whose village/taluka/district/state matches the free-text location. */
  matchFarms(farms: FarmWithLocation[], text: string): FarmWithLocation[] {
    const parts = text.split(",").map((p) => normalizeText(p)).filter(Boolean);
    if (parts.length === 0) return [];
    const hit = (farm: FarmWithLocation, part: string): boolean =>
      [farm.village, farm.taluka.name, farm.district.name, farm.state.name].some((f) => {
        const v = normalizeText(f ?? "");
        return v === part || (part.length >= 4 && v.includes(part)) || (part.length >= 5 && levenshtein(v, part, 1) <= 1);
      });
    return farms.filter((f) => parts.some((p) => hit(f, p)));
  }

  // ---------------------------- locations --------------------------------

  private async loadLocations() {
    if (this.locCache && Date.now() - this.locCache.at < 10 * 60_000) return this.locCache;
    const rows = await this.prisma.mandi.findMany({ distinct: ["state", "district"], select: { state: true, district: true } });
    const districts = new Map<string, { display: string; state: string }>();
    const states = new Map<string, string>();
    for (const r of rows) {
      if (r.district) districts.set(normalizeText(r.district), { display: r.district, state: r.state });
      if (r.state) states.set(normalizeText(r.state), r.state);
    }
    this.locCache = { at: Date.now(), districts, states };
    return this.locCache;
  }

  /**
   * Resolve typed text ("Sehore", "Sehore, Madhya Pradesh", a mandi name) to a
   * state/district present in ANNDATA's mandi data. Pincodes can't be
   * resolved (no pincode dataset in ANNDATA) → null, and the caller asks for a
   * district instead.
   */
  async resolveLocation(text: string): Promise<ResolvedLocation | null> {
    const parts = text.split(",").map((p) => normalizeText(p)).filter((p) => p && !/^\d{6}$/.test(p));
    if (parts.length === 0) return null;
    const { districts, states } = await this.loadLocations();
    const fuzzy = <T>(map: Map<string, T>, needle: string): T | undefined => {
      const direct = map.get(needle);
      if (direct) return direct;
      if (needle.length < 5) return undefined;
      for (const [k, v] of map) if (levenshtein(k, needle, 1) <= 1) return v;
      return undefined;
    };
    let district: { display: string; state: string } | undefined;
    let state: string | undefined;
    for (const p of parts) {
      district ??= fuzzy(districts, p);
      state ??= fuzzy(states, p);
    }
    if (!district && !state) {
      // A single mandi name (e.g. "Sehore APMC") — fall back to a name search.
      const m = await this.prisma.mandi.findFirst({ where: { normalizedName: { contains: parts[0]!, mode: "insensitive" } }, select: { state: true, district: true } });
      if (m) return { state: m.state, district: m.district, display: m.district };
      return null;
    }
    if (district) return { state: state ?? district.state, district: district.display, display: district.display };
    return { state: state!, district: null, display: state! };
  }
}
