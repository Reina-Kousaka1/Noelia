export const WARDROBE_SLOTS = [
  'leotard',
  'skirt',
  'wrap',
  'outerwear',
  'legwear',
  'tights',
  'shoes',
  'bag',
  'hair_accessory',
  'jewelry',
  'accessory',
] as const;

export type WardrobeSlot = (typeof WARDROBE_SLOTS)[number];

export interface WardrobeOutfitItem {
  readonly itemId: string;
  readonly displayName: string;
  readonly slots: readonly WardrobeSlot[];
  readonly equippedAt: Date;
}

export interface WardrobeEquipResult {
  readonly itemId: string;
  readonly displayName: string;
  readonly slots: readonly WardrobeSlot[];
  readonly displacedItems: readonly { readonly itemId: string; readonly displayName: string }[];
}

export interface WardrobePort {
  getOutfit(discordUserId: string): Promise<readonly WardrobeOutfitItem[]>;
  equip(discordUserId: string, itemId: string): Promise<WardrobeEquipResult>;
  unequip(discordUserId: string, slot: WardrobeSlot): Promise<WardrobeOutfitItem | undefined>;
}
