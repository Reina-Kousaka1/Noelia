import type { AvatarAppearance } from "./avatarModel";

// Local display examples only. These are not inventory items and are never saved.
export const devAppearances: AvatarAppearance[] = [
  {
    id: "rose-rehearsal",
    label: "Rose rehearsal",
    note: "Soft rose tones for a quiet practice.",
    layers: {
      base: "warm",
      hair: "chignon",
      top: "rose",
      bottom: "tulle",
      legwear: "blush",
      shoes: "rose",
      accessories: "pearls",
      hairAccessory: "bow",
      foregroundEffects: "petals",
    },
  },
  {
    id: "ivory-matinée",
    label: "Ivory matinée",
    note: "A light ivory look for the studio preview.",
    layers: {
      base: "warm",
      hair: "chignon",
      top: "ivory",
      bottom: "soft-tulle",
      legwear: "ivory",
      shoes: "satin",
      accessories: "ribbon",
      hairAccessory: "pearl-pin",
      foregroundEffects: "glimmer",
    },
  },
];

export const defaultDevAppearance = devAppearances[0];
