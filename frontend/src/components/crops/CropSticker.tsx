import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Maps common crop/produce names to a representative emoji, the way Blinkit
 * shows a little illustrated vegetable/fruit icon for each produce category.
 * Falls back to a generic sheaf-of-wheat icon for anything unrecognised.
 */
const CROP_EMOJI: Record<string, string> = {
  tomato: "🍅",
  onion: "🧅",
  potato: "🥔",
  wheat: "🌾",
  rice: "🌾",
  paddy: "🌾",
  maize: "🌽",
  corn: "🌽",
  cotton: "☁️",
  sugarcane: "🎋",
  banana: "🍌",
  mango: "🥭",
  apple: "🍎",
  grape: "🍇",
  grapes: "🍇",
  orange: "🍊",
  chilli: "🌶️",
  chili: "🌶️",
  "green chilli": "🌶️",
  brinjal: "🍆",
  eggplant: "🍆",
  cabbage: "🥬",
  cauliflower: "🥦",
  broccoli: "🥦",
  spinach: "🥬",
  carrot: "🥕",
  cucumber: "🥒",
  pea: "🫛",
  peas: "🫛",
  groundnut: "🥜",
  peanut: "🥜",
  soybean: "🫘",
  soyabean: "🫘",
  lentil: "🫘",
  gram: "🫘",
  turmeric: "🫚",
  ginger: "🫚",
  garlic: "🧄",
  coconut: "🥥",
  papaya: "🫐",
  watermelon: "🍉",
  melon: "🍈",
  lemon: "🍋",
  pumpkin: "🎃",
  okra: "🫛",
  "lady finger": "🫛",
  mustard: "🌻",
  sunflower: "🌻",
  tea: "🍃",
  coffee: "☕",
  coriander: "🌿",
};

function emojiFor(name?: string) {
  if (!name) return "🌾";
  const key = name.trim().toLowerCase();
  if (CROP_EMOJI[key]) return CROP_EMOJI[key];
  const match = Object.keys(CROP_EMOJI).find((k) => key.includes(k) || k.includes(key));
  return match ? CROP_EMOJI[match] : "🌾";
}

export function CropSticker({
  name,
  size = "md",
  className,
}: {
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-8 w-8 text-base",
    md: "h-11 w-11 text-xl",
    lg: "h-16 w-16 text-3xl",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/25 to-accent/10 ring-1 ring-accent/30",
        sizes[size],
        className,
      )}
      role="img"
      aria-label={name ?? "crop"}
    >
      {emojiFor(name)}
    </span>
  );
}
