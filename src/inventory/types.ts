import type { ShopRarity } from '../shop/rarity.js';

export type InventorySource =
  | 'SHOP_PURCHASE'
  | 'BALLET_REWARD'
  | 'DAILY_REWARD'
  | 'EVENT_REWARD'
  | 'ADMIN_GRANT'
  | 'MARKETPLACE';

export interface InventoryEntry {
  readonly itemId: string;
  readonly displayName: string;
  readonly category: string;
  readonly rarity: ShopRarity;
  readonly quantity: number;
  readonly acquiredAt: Date;
  readonly source: InventorySource;
}

export interface InventoryPage {
  readonly entries: readonly InventoryEntry[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface InventoryPort {
  listInventory(discordUserId: string, page: number): Promise<InventoryPage>;
}
