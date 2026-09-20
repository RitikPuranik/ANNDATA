/**
 * Crop look-up used by <CropVisual />.
 *
 * - `CUSTOM_ICON_PATHS`: 24x24, stroke-based glyphs drawn to match the lucide
 *   icon style (1.75 stroke, round caps) for crops lucide doesn't have.
 * - `resolveCrop()`: turns a crop name / category into an icon + colour tone.
 *
 * Adding a crop = one line in CROP_RULES. Unknown crops fall back to their
 * category, then to a neutral "sprout" so a card never looks broken.
 */

export const CUSTOM_ICON_PATHS: Record<string, string[]> = {
  tomato: [
    "M12 8c-4.6 0-7.6 2.6-7.6 6.2 0 3.3 3.1 5.8 7.6 5.8s7.6-2.5 7.6-5.8C19.6 10.6 16.6 8 12 8Z",
    "M8.2 8.6 12 10.4l3.8-1.8",
    "M12 10.4 9.6 6.6M12 10.4l2.4-3.8",
    "M12 8V4.6c1-.9 2.3-1.1 3.2-.7",
  ],
  onion: [
    "M12 3.2c.5 2.2 1.5 3.5 3.1 4.9 2.5 1.5 3.9 3.5 3.9 5.9 0 3.6-3 6.3-7 6.3s-7-2.7-7-6.3c0-2.4 1.4-4.4 3.9-5.9C10.5 6.7 11.5 5.4 12 3.2Z",
    "M12 3.2c-2.1 4.2-2.7 8.6-2.4 15.2",
    "M12 3.2c2.1 4.2 2.7 8.6 2.4 15.2",
    "M10.6 20.6l-.5 1.4M13.4 20.6l.5 1.4",
  ],
  potato: [
    "M5.6 9.4c1.6-2.8 6-4.4 9.6-3.4 3.4.9 5.5 3.9 4.7 7.4-.9 3.7-4.6 6-9 5.7-4.2-.3-7-2.4-7-5.4 0-1.4.6-3.2 1.7-4.3Z",
    "M9.2 10.6h.01M13.8 9.2h.01M15.6 13.4h.01M10.8 14.8h.01",
  ],
  cotton: [
    "M12 3.4a3.2 3.2 0 0 1 3.1 2.5 3.4 3.4 0 0 1 2.6 3.3 3.4 3.4 0 0 1-3.5 3.4H9.8a3.4 3.4 0 0 1-3.5-3.4 3.4 3.4 0 0 1 2.6-3.3A3.2 3.2 0 0 1 12 3.4Z",
    "M9 12.4 5.2 15.6l4 .3 1.2 4",
    "M15 12.4l3.8 3.2-4 .3-1.2 4",
    "M12 13v8",
  ],
  maize: [
    "M12 2.8c2.2 0 3.6 2.7 3.6 6.6S14.2 16 12 16 8.4 13.3 8.4 9.4 9.8 2.8 12 2.8Z",
    "M12 2.8V16M9 6.6h6M8.5 9.6h7M9 12.6h6",
    "M8.3 12.4C6.4 14 6.3 17.8 12 21.2c5.7-3.4 5.6-7.2 3.7-8.8",
  ],
  sugarcane: [
    "M10 5.5h4a1.2 1.2 0 0 1 1.2 1.2v13.6A1.2 1.2 0 0 1 14 21.5h-4a1.2 1.2 0 0 1-1.2-1.2V6.7A1.2 1.2 0 0 1 10 5.5Z",
    "M8.8 10.2h6.4M8.8 14.6h6.4M8.8 18.4h6.4",
    "M12 5.5C12 2.8 9.6 1.9 6 3M12 5.5c0-2.7 2.4-3.6 6-2.5",
  ],
  chilli: [
    "M17.2 6.8c2 2.7 2 6.3-.4 9.5-2.3 3.1-6.3 4.9-11.6 4.6 3.2-1.5 4.9-3.5 6-6.2 1.4-3.3 1.8-6.4 6-7.9Z",
    "M17.2 6.8 19.4 4.4M15 5.4c.6.6 1.4 1.1 2.2 1.4",
  ],
};

/** lucide icon names we use (resolved in CropVisual). */
export type LucideCropIcon =
  | "Wheat" | "Bean" | "Apple" | "Banana" | "Grape" | "Citrus" | "Cherry"
  | "Carrot" | "LeafyGreen" | "Nut" | "Sprout" | "Milk" | "Package" | "Leaf";

export type CropIconKey = keyof typeof CUSTOM_ICON_PATHS | LucideCropIcon;

export interface CropTone {
  from: string;
  to: string;
}

const TONES: Record<string, CropTone> = {
  wheat: { from: "#dbb45a", to: "#a9782a" },
  rice: { from: "#cfc17f", to: "#948846" },
  maize: { from: "#e6bb3d", to: "#b5821a" },
  tomato: { from: "#e46b53", to: "#b33b2d" },
  onion: { from: "#c98ba7", to: "#8f4f70" },
  potato: { from: "#c39c6c", to: "#86633f" },
  cotton: { from: "#9db5d2", to: "#5f7ea7" },
  pulse: { from: "#c09c55", to: "#8b6b2b" },
  oilseed: { from: "#b9a24b", to: "#7d6a22" },
  sugarcane: { from: "#70c08b", to: "#2f8058" },
  vegetable: { from: "#80b66b", to: "#3f7f3e" },
  fruit: { from: "#ef9b60", to: "#c2602f" },
  spice: { from: "#de6b46", to: "#a53a1f" },
  dairy: { from: "#b9c8d7", to: "#7c94ab" },
  produce: { from: "#e0c04f", to: "#a8842f" },
  default: { from: "#a0b98b", to: "#587a4b" },
};

interface Rule {
  match: string[];
  icon: CropIconKey;
  tone: keyof typeof TONES;
}

// Order matters: first rule with a matching keyword wins.
const CROP_RULES: Rule[] = [
  { match: ["tomato", "टमाटर", "टोमॅटो"], icon: "tomato", tone: "tomato" },
  { match: ["onion", "garlic", "प्याज", "कांदा"], icon: "onion", tone: "onion" },
  { match: ["potato", "आलू", "बटाटा"], icon: "potato", tone: "potato" },
  { match: ["cotton", "कपास", "कापूस"], icon: "cotton", tone: "cotton" },
  { match: ["sugarcane", "sugar cane", "ऊस"], icon: "sugarcane", tone: "sugarcane" },
  { match: ["maize", "corn", "मक्का", "मका"], icon: "maize", tone: "maize" },
  { match: ["rice", "paddy", "चावल", "तांदूळ"], icon: "Wheat", tone: "rice" },
  { match: ["wheat", "barley", "jowar", "sorghum", "bajra", "millet", "ragi", "गेहूं", "गहू"], icon: "Wheat", tone: "wheat" },
  { match: ["chilli", "chili", "pepper", "capsicum"], icon: "chilli", tone: "spice" },
  { match: ["turmeric", "ginger", "coriander", "cumin", "spice"], icon: "Sprout", tone: "spice" },
  { match: ["groundnut", "peanut", "mustard", "sunflower", "sesame", "coconut"], icon: "Nut", tone: "oilseed" },
  { match: ["soybean", "soyabean", "सोयाबीन"], icon: "Bean", tone: "oilseed" },
  { match: ["tur", "arhar", "gram", "chana", "lentil", "moong", "urad", "pea", "peas", "तूर"], icon: "Bean", tone: "pulse" },
  { match: ["banana"], icon: "Banana", tone: "fruit" },
  { match: ["grape"], icon: "Grape", tone: "onion" },
  { match: ["orange", "lemon", "lime", "citrus", "mosambi"], icon: "Citrus", tone: "fruit" },
  { match: ["pomegranate", "cherry", "strawberry"], icon: "Cherry", tone: "tomato" },
  { match: ["mango", "apple", "papaya", "guava", "melon", "fruit"], icon: "Apple", tone: "fruit" },
  { match: ["carrot", "radish", "beet"], icon: "Carrot", tone: "fruit" },
  { match: ["spinach", "cabbage", "cauliflower", "broccoli", "lettuce", "methi", "leafy"], icon: "LeafyGreen", tone: "vegetable" },
  { match: ["milk", "dairy"], icon: "Milk", tone: "dairy" },
];

const CATEGORY_RULES: Rule[] = [
  { match: ["cereal", "grain"], icon: "Wheat", tone: "wheat" },
  { match: ["pulse", "legume"], icon: "Bean", tone: "pulse" },
  { match: ["oilseed", "oil seed", "nut"], icon: "Nut", tone: "oilseed" },
  { match: ["fibre", "fiber"], icon: "cotton", tone: "cotton" },
  { match: ["spice"], icon: "chilli", tone: "spice" },
  { match: ["fruit"], icon: "Apple", tone: "fruit" },
  { match: ["vegetable", "veg"], icon: "LeafyGreen", tone: "vegetable" },
  { match: ["sugar"], icon: "sugarcane", tone: "sugarcane" },
  { match: ["dairy"], icon: "Milk", tone: "dairy" },
];

export interface ResolvedCrop {
  icon: CropIconKey;
  tone: CropTone;
  slug: string;
}

export function slugify(name?: string | null): string {
  return (name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0900-\u097F]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tokens(text: string): string[] {
  return text.split(/[^a-z\u0900-\u097F]+/).filter(Boolean);
}

/** Short keys ("tur", "pea", "gram") must match a whole word; longer keys can match inside one. */
function hit(text: string, words: string[], key: string): boolean {
  return key.length <= 4 ? words.includes(key) : text.includes(key);
}

export function resolveCrop(name?: string | null, category?: string | null): ResolvedCrop {
  const n = (name ?? "").toLowerCase();
  const c = (category ?? "").toLowerCase();
  const slug = slugify(name) || "crop";

  const nTokens = tokens(n);
  const cTokens = tokens(c);
  const byName = CROP_RULES.find((r) => r.match.some((k) => hit(n, nTokens, k)));
  if (byName) return { icon: byName.icon, tone: TONES[byName.tone], slug };

  const byCategory = CATEGORY_RULES.find((r) => r.match.some((k) => hit(c, cTokens, k)));
  if (byCategory) return { icon: byCategory.icon, tone: TONES[byCategory.tone], slug };

  return { icon: "Sprout", tone: TONES.default, slug };
}

export function toneFor(key: keyof typeof TONES): CropTone {
  return TONES[key] ?? TONES.default;
}
