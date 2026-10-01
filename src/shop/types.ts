import type { ShopRarity } from './rarity.js';

export const SHOP_CATEGORIES = [
  'leotard',
  'skirt',
  'wrap_top',
  'outerwear',
  'legwear',
  'tights',
  'ballet_flats',
  'pointe_shoes',
  'bag',
  'hair_accessory',
  'jewelry',
  'accessory',
  'studio_item',
  'collectible',
  'seasonal',
  'event_item',
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];
export type { ShopRarity } from './rarity.js';

export interface ShopItem {
  readonly itemId: string;
  readonly displayName: string;
  readonly description: string;
  readonly category: ShopCategory;
  readonly rarity: ShopRarity;
  readonly price: bigint;
  readonly active: boolean;
  readonly purchasable: boolean;
  readonly stackable: boolean;
  readonly minimumBalletLevel: number | null;
  readonly collection: string | null;
  readonly cosmeticMetadata: Readonly<Record<string, unknown>>;
}

export interface ShopPurchaseResult {
  readonly item: ShopItem;
  readonly quantity: number;
  readonly unitPrice: bigint;
  readonly totalPrice: bigint;
  readonly inventoryQuantity: number;
  readonly walletBalance: bigint;
  readonly replayed: boolean;
}

export interface ShopPort {
  listItems(category?: ShopCategory): Promise<readonly ShopItem[]>;
  getItem(itemId: string): Promise<ShopItem | undefined>;
  purchase(
    interactionId: string,
    discordUserId: string,
    itemId: string,
    quantity: number,
  ): Promise<ShopPurchaseResult>;
}
