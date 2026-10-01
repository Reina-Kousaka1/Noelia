import type { ShopRarity } from '../shop/types.js';

export const MARKETPLACE_STATUSES = ['ACTIVE', 'SOLD', 'CANCELLED'] as const;
export type MarketplaceStatus = (typeof MARKETPLACE_STATUSES)[number];

export interface MarketplaceListing {
  readonly listingId: string;
  readonly sellerUserId: string;
  readonly itemId: string;
  readonly displayName: string;
  readonly category: string;
  readonly rarity: ShopRarity;
  readonly quantity: number;
  readonly unitPrice: bigint;
  readonly status: MarketplaceStatus;
  readonly createdAt: Date;
}

export interface MarketplaceListingPage {
  readonly listings: readonly MarketplaceListing[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalListings: number;
  readonly totalPages: number;
}

export interface MarketplaceListingResult {
  readonly listing: MarketplaceListing;
  readonly replayed: boolean;
}

export interface MarketplacePurchaseResult {
  readonly listing: MarketplaceListing;
  readonly totalPrice: bigint;
  readonly buyerBalance: bigint;
  readonly sellerBalance: bigint;
  readonly replayed: boolean;
}

export interface MarketplacePort {
  browse(page: number): Promise<MarketplaceListingPage>;
  listMine(discordUserId: string, page: number): Promise<MarketplaceListingPage>;
  createListing(
    interactionId: string,
    sellerUserId: string,
    itemId: string,
    quantity: number,
    unitPrice: bigint,
  ): Promise<MarketplaceListingResult>;
  buy(
    interactionId: string,
    buyerUserId: string,
    listingId: string,
  ): Promise<MarketplacePurchaseResult>;
  cancel(
    interactionId: string,
    sellerUserId: string,
    listingId: string,
  ): Promise<MarketplaceListingResult>;
}
