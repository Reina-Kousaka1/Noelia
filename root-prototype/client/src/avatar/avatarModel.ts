export const avatarLayerOrder = [
  "base",
  "hair",
  "top",
  "bottom",
  "legwear",
  "shoes",
  "accessories",
  "hairAccessory",
  "foregroundEffects",
] as const;

export type AvatarLayerSlot = (typeof avatarLayerOrder)[number];

export type AvatarAppearance = {
  id: string;
  label: string;
  note: string;
  layers: Partial<Record<AvatarLayerSlot, string>>;
};

export const avatarLayerLabels: Record<AvatarLayerSlot, string> = {
  base: "Base",
  hair: "Hair",
  top: "Leotard / top",
  bottom: "Bottom / skirt",
  legwear: "Legwear",
  shoes: "Shoes",
  accessories: "Accessories",
  hairAccessory: "Hair accessory",
  foregroundEffects: "Foreground effects",
};
