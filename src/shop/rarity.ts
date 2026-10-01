export const SHOP_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export type ShopRarity = (typeof SHOP_RARITIES)[number];

export const SHOP_RARITY_LABELS: Readonly<Record<ShopRarity, string>> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export function parseShopRarity(value: string): ShopRarity {
  if ((SHOP_RARITIES as readonly string[]).includes(value)) return value as ShopRarity;
  throw new Error('Unsupported shop rarity in catalog.');
}
