import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { evaluateCollectionAchievements, unlockAchievement } from '../achievements/unlock.js';
import { withTransaction } from '../database/transaction.js';
import { IdempotencyConflictError } from '../economy/errors.js';
import type { WalletTransferTransactionPort } from '../economy/ports.js';
import { InventoryQuantityLimitError } from '../shop/errors.js';
import type { ShopRarity } from '../shop/types.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import {
  MarketplaceBuyerOwnsUniqueItemError,
  MarketplaceItemEquippedError,
  MarketplaceItemNotOwnedError,
  MarketplaceListingNotFoundError,
  MarketplaceListingUnavailableError,
  MarketplaceNotSellerError,
  MarketplacePageError,
  MarketplacePriceError,
  MarketplaceQuantityError,
  MarketplaceSelfPurchaseError,
} from './errors.js';
import type {
  MarketplaceListing,
  MarketplaceListingPage,
  MarketplaceListingResult,
  MarketplacePort,
  MarketplacePurchaseResult,
  MarketplaceStatus,
} from './types.js';

const PAGE_SIZE = 10;
const MAX_PAGE = 100_000;
const MAX_INVENTORY_STACK = 99_999;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const itemIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const listingIdPattern = /^[1-9][0-9]{0,18}$/;

type MarketplaceOperation = 'SELL' | 'BUY' | 'CANCEL';

interface ListingRow extends QueryResultRow {
  readonly listing_id: string;
  readonly seller_user_id: string;
  readonly item_id: string;
  readonly display_name: string;
  readonly category: string;
  readonly rarity: string;
  readonly quantity: number;
  readonly unit_price: string;
  readonly status: string;
  readonly created_at: Date;
}

interface ListingCountRow extends QueryResultRow {
  readonly total_listings: string;
}

interface ListingIdRow extends QueryResultRow {
  readonly listing_id: string;
}

interface RequestRow extends QueryResultRow {
  readonly operation: MarketplaceOperation;
  readonly request_fingerprint: string;
  readonly listing_id: string | null;
  readonly completed: boolean;
}

interface CatalogAvailabilityRow extends QueryResultRow {
  readonly stackable: boolean;
}

interface InventoryQuantityRow extends QueryResultRow {
  readonly quantity: number;
}

interface SellerInventoryRow extends InventoryQuantityRow {
  readonly source: string;
  readonly acquired_at: Date;
}

interface EscrowRow extends QueryResultRow {
  readonly seller_user_id: string;
  readonly item_id: string;
  readonly quantity: number;
  readonly original_source: string;
  readonly original_acquired_at: Date;
}

interface ExistingSaleRow extends ListingRow {
  readonly total_price: string;
  readonly buyer_balance_after: string;
  readonly seller_balance_after: string;
}

export class MarketplaceService implements MarketplacePort {
  public constructor(
    private readonly pool: Pool,
    private readonly wallet: WalletTransferTransactionPort,
  ) {}

  public async browse(page: number): Promise<MarketplaceListingPage> {
    this.validatePage(page);
    const countResult = await this.pool.query<ListingCountRow>(
      `SELECT count(*)::text AS total_listings
       FROM marketplace_listings
       WHERE status = 'ACTIVE'`,
    );
    const rows = await this.pool.query<ListingRow>(
      `${listingSelect}
       WHERE listing.status = 'ACTIVE'
       ORDER BY listing.created_at DESC, listing.listing_id DESC
       LIMIT $1 OFFSET $2`,
      [PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );
    return this.toPage(rows.rows, countResult.rows[0]?.total_listings ?? '0', page);
  }

  public async listMine(discordUserId: string, page: number): Promise<MarketplaceListingPage> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    this.validatePage(page);
    const countResult = await this.pool.query<ListingCountRow>(
      `SELECT count(*)::text AS total_listings
       FROM marketplace_listings
       WHERE seller_user_id = $1`,
      [discordUserId],
    );
    const rows = await this.pool.query<ListingRow>(
      `${listingSelect}
       WHERE listing.seller_user_id = $1
       ORDER BY listing.created_at DESC, listing.listing_id DESC
       LIMIT $2 OFFSET $3`,
      [discordUserId, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );
    return this.toPage(rows.rows, countResult.rows[0]?.total_listings ?? '0', page);
  }

  public async createListing(
    interactionId: string,
    sellerUserId: string,
    itemId: string,
    quantity: number,
    unitPrice: bigint,
  ): Promise<MarketplaceListingResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(sellerUserId, 'Seller Discord user ID');
    this.validateItemId(itemId);
    this.validateQuantity(quantity);
    this.validatePrice(unitPrice, quantity);

    const requestFingerprint = this.fingerprint(
      'SELL',
      sellerUserId,
      itemId,
      quantity.toString(),
      unitPrice.toString(),
    );

    return withTransaction(this.pool, async (client) => {
      const replay = await this.reserveRequest(client, interactionId, 'SELL', requestFingerprint);
      if (replay !== undefined) {
        return {
          listing: await this.readListing(client, replay.listing_id),
          replayed: true,
        };
      }

      await this.ensureAndLockUsers(client, [sellerUserId]);
      const catalogResult = await client.query<CatalogAvailabilityRow>(
        `SELECT stackable FROM shop_catalog WHERE item_id = $1 FOR SHARE`,
        [itemId],
      );
      const catalog = catalogResult.rows[0];
      if (catalog === undefined) {
        throw new MarketplaceItemNotOwnedError();
      }
      if (!catalog.stackable && quantity !== 1) {
        throw new MarketplaceQuantityError();
      }

      const inventoryResult = await client.query<SellerInventoryRow>(
        `SELECT quantity, source, acquired_at
         FROM user_inventory
         WHERE discord_user_id = $1 AND item_id = $2
         FOR UPDATE`,
        [sellerUserId, itemId],
      );
      const inventory = inventoryResult.rows[0];
      if (inventory === undefined || inventory.quantity < quantity) {
        throw new MarketplaceItemNotOwnedError();
      }

      const equippedResult = await client.query<{ readonly item_id: string }>(
        `SELECT item_id
         FROM wardrobe_equipment
         WHERE discord_user_id = $1 AND item_id = $2
         LIMIT 1
         FOR UPDATE`,
        [sellerUserId, itemId],
      );
      if (equippedResult.rows[0] !== undefined) {
        throw new MarketplaceItemEquippedError();
      }

      const listingResult = await client.query<ListingIdRow>(
        `INSERT INTO marketplace_listings (seller_user_id, item_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)
         RETURNING listing_id`,
        [sellerUserId, itemId, quantity, unitPrice.toString()],
      );
      const listingId = listingResult.rows[0]?.listing_id;
      if (listingId === undefined) {
        throw new Error('Marketplace listing was not created.');
      }

      if (inventory.quantity === quantity) {
        await client.query(
          `DELETE FROM user_inventory
           WHERE discord_user_id = $1 AND item_id = $2`,
          [sellerUserId, itemId],
        );
      } else {
        await client.query(
          `UPDATE user_inventory
           SET quantity = quantity - $3
           WHERE discord_user_id = $1 AND item_id = $2`,
          [sellerUserId, itemId, quantity],
        );
      }

      await client.query(
        `INSERT INTO marketplace_escrow (
           listing_id, seller_user_id, item_id, quantity, original_source, original_acquired_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [listingId, sellerUserId, itemId, quantity, inventory.source, inventory.acquired_at],
      );
      await evaluateCollectionAchievements(client, sellerUserId, interactionId);
      await this.completeRequest(client, interactionId, listingId);

      return { listing: await this.readListing(client, listingId), replayed: false };
    });
  }

  public async buy(
    interactionId: string,
    buyerUserId: string,
    listingId: string,
  ): Promise<MarketplacePurchaseResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(buyerUserId, 'Buyer Discord user ID');
    this.validateListingId(listingId);
    const requestFingerprint = this.fingerprint('BUY', buyerUserId, listingId);

    return withTransaction(this.pool, async (client) => {
      const replay = await this.reserveRequest(client, interactionId, 'BUY', requestFingerprint);
      if (replay !== undefined) {
        return this.readPurchase(client, interactionId, true);
      }

      const listingResult = await client.query<ListingRow>(
        `${listingSelect}
         WHERE listing.listing_id = $1
         FOR UPDATE OF listing`,
        [listingId],
      );
      const listing = listingResult.rows[0];
      if (listing === undefined) {
        throw new MarketplaceListingNotFoundError();
      }
      if (listing.status !== 'ACTIVE') {
        throw new MarketplaceListingUnavailableError();
      }
      if (listing.seller_user_id === buyerUserId) {
        throw new MarketplaceSelfPurchaseError();
      }

      await this.ensureAndLockUsers(client, [buyerUserId, listing.seller_user_id]);
      const escrowResult = await client.query<EscrowRow>(
        `SELECT seller_user_id, item_id, quantity, original_source, original_acquired_at
         FROM marketplace_escrow
         WHERE listing_id = $1
         FOR UPDATE`,
        [listingId],
      );
      const escrow = escrowResult.rows[0];
      if (
        escrow === undefined ||
        escrow.seller_user_id !== listing.seller_user_id ||
        escrow.item_id !== listing.item_id ||
        escrow.quantity !== listing.quantity
      ) {
        throw new Error('Marketplace listing escrow is missing or inconsistent.');
      }

      const catalogResult = await client.query<CatalogAvailabilityRow>(
        `SELECT stackable FROM shop_catalog WHERE item_id = $1 FOR SHARE`,
        [listing.item_id],
      );
      const catalog = catalogResult.rows[0];
      if (catalog === undefined) {
        throw new Error('Marketplace item catalog entry is missing.');
      }
      if (!catalog.stackable && listing.quantity !== 1) {
        throw new MarketplaceQuantityError();
      }

      const inventoryResult = await client.query<InventoryQuantityRow>(
        `SELECT quantity
         FROM user_inventory
         WHERE discord_user_id = $1 AND item_id = $2
         FOR UPDATE`,
        [buyerUserId, listing.item_id],
      );
      const currentQuantity = inventoryResult.rows[0]?.quantity ?? 0;
      if (!catalog.stackable && currentQuantity > 0) {
        throw new MarketplaceBuyerOwnsUniqueItemError();
      }
      if (currentQuantity + listing.quantity > MAX_INVENTORY_STACK) {
        throw new InventoryQuantityLimitError();
      }

      const unitPrice = BigInt(listing.unit_price);
      const totalPrice = unitPrice * BigInt(listing.quantity);
      this.validatePrice(unitPrice, listing.quantity);
      const transfer = await this.wallet.transferWithinTransaction(client, {
        interactionId,
        fromDiscordUserId: buyerUserId,
        toDiscordUserId: listing.seller_user_id,
        amount: totalPrice,
        referenceId: listing.listing_id,
      });

      if (currentQuantity === 0) {
        await client.query(
          `INSERT INTO user_inventory (discord_user_id, item_id, quantity, source)
           VALUES ($1, $2, $3, 'MARKETPLACE')`,
          [buyerUserId, listing.item_id, listing.quantity],
        );
      } else {
        await client.query(
          `UPDATE user_inventory
           SET quantity = $3, source = 'MARKETPLACE', acquired_at = now()
           WHERE discord_user_id = $1 AND item_id = $2`,
          [buyerUserId, listing.item_id, currentQuantity + listing.quantity],
        );
      }

      await client.query(
        `UPDATE marketplace_listings
         SET status = 'SOLD', sold_at = clock_timestamp()
         WHERE listing_id = $1`,
        [listingId],
      );
      await client.query(`DELETE FROM marketplace_escrow WHERE listing_id = $1`, [listingId]);
      await client.query(
        `INSERT INTO marketplace_sales (
           listing_id, interaction_id, buyer_user_id, seller_user_id, item_id,
           quantity, unit_price, total_price, request_fingerprint,
           wallet_transaction_id, buyer_balance_after, seller_balance_after
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          listingId,
          interactionId,
          buyerUserId,
          listing.seller_user_id,
          listing.item_id,
          listing.quantity,
          unitPrice.toString(),
          totalPrice.toString(),
          requestFingerprint,
          transfer.transactionId,
          transfer.fromBalance.toString(),
          transfer.toBalance.toString(),
        ],
      );
      await unlockAchievement(
        client,
        listing.seller_user_id,
        'first-market-sale',
        'MARKETPLACE_SALE',
        interactionId,
      );
      await unlockAchievement(
        client,
        buyerUserId,
        'first-market-purchase',
        'MARKETPLACE_PURCHASE',
        interactionId,
      );
      await evaluateCollectionAchievements(client, buyerUserId, interactionId);
      await this.completeRequest(client, interactionId, listingId);

      return {
        listing: await this.readListing(client, listingId),
        totalPrice,
        buyerBalance: transfer.fromBalance,
        sellerBalance: transfer.toBalance,
        replayed: false,
      };
    });
  }

  public async cancel(
    interactionId: string,
    sellerUserId: string,
    listingId: string,
  ): Promise<MarketplaceListingResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(sellerUserId, 'Seller Discord user ID');
    this.validateListingId(listingId);
    const requestFingerprint = this.fingerprint('CANCEL', sellerUserId, listingId);

    return withTransaction(this.pool, async (client) => {
      const replay = await this.reserveRequest(client, interactionId, 'CANCEL', requestFingerprint);
      if (replay !== undefined) {
        return { listing: await this.readListing(client, replay.listing_id), replayed: true };
      }

      const listingResult = await client.query<ListingRow>(
        `${listingSelect}
         WHERE listing.listing_id = $1
         FOR UPDATE OF listing`,
        [listingId],
      );
      const listing = listingResult.rows[0];
      if (listing === undefined) {
        throw new MarketplaceListingNotFoundError();
      }
      if (listing.seller_user_id !== sellerUserId) {
        throw new MarketplaceNotSellerError();
      }
      if (listing.status !== 'ACTIVE') {
        throw new MarketplaceListingUnavailableError();
      }

      await this.ensureAndLockUsers(client, [sellerUserId]);
      const escrowResult = await client.query<EscrowRow>(
        `SELECT seller_user_id, item_id, quantity, original_source, original_acquired_at
         FROM marketplace_escrow
         WHERE listing_id = $1
         FOR UPDATE`,
        [listingId],
      );
      const escrow = escrowResult.rows[0];
      if (
        escrow === undefined ||
        escrow.seller_user_id !== listing.seller_user_id ||
        escrow.item_id !== listing.item_id ||
        escrow.quantity !== listing.quantity
      ) {
        throw new Error('Marketplace listing escrow is missing or inconsistent.');
      }

      const inventoryResult = await client.query<InventoryQuantityRow>(
        `SELECT quantity
         FROM user_inventory
         WHERE discord_user_id = $1 AND item_id = $2
         FOR UPDATE`,
        [sellerUserId, listing.item_id],
      );
      const currentQuantity = inventoryResult.rows[0]?.quantity ?? 0;
      if (currentQuantity + listing.quantity > MAX_INVENTORY_STACK) {
        throw new InventoryQuantityLimitError();
      }

      await client.query(
        `UPDATE marketplace_listings
         SET status = 'CANCELLED', cancelled_at = clock_timestamp()
         WHERE listing_id = $1`,
        [listingId],
      );
      await client.query(`DELETE FROM marketplace_escrow WHERE listing_id = $1`, [listingId]);
      if (currentQuantity === 0) {
        await client.query(
          `INSERT INTO user_inventory (discord_user_id, item_id, quantity, source, acquired_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            sellerUserId,
            listing.item_id,
            listing.quantity,
            escrow.original_source,
            escrow.original_acquired_at,
          ],
        );
      } else {
        await client.query(
          `UPDATE user_inventory
           SET quantity = $3
           WHERE discord_user_id = $1 AND item_id = $2`,
          [sellerUserId, listing.item_id, currentQuantity + listing.quantity],
        );
      }
      await this.completeRequest(client, interactionId, listingId);

      return { listing: await this.readListing(client, listingId), replayed: false };
    });
  }

  private async reserveRequest(
    client: PoolClient,
    interactionId: string,
    operation: MarketplaceOperation,
    requestFingerprint: string,
  ): Promise<RequestRow | undefined> {
    const inserted = await client.query<{ readonly interaction_id: string }>(
      `INSERT INTO marketplace_requests (interaction_id, operation, request_fingerprint)
       VALUES ($1, $2, $3)
       ON CONFLICT (interaction_id) DO NOTHING
       RETURNING interaction_id`,
      [interactionId, operation, requestFingerprint],
    );
    if (inserted.rows[0] !== undefined) {
      return undefined;
    }

    const existingResult = await client.query<RequestRow>(
      `SELECT operation, request_fingerprint, listing_id, completed
       FROM marketplace_requests
       WHERE interaction_id = $1
       FOR UPDATE`,
      [interactionId],
    );
    const existing = existingResult.rows[0];
    if (existing === undefined) {
      throw new Error('Marketplace idempotency record could not be loaded.');
    }
    if (existing.operation !== operation || existing.request_fingerprint !== requestFingerprint) {
      throw new IdempotencyConflictError();
    }
    if (!existing.completed || existing.listing_id === null) {
      throw new Error('A committed marketplace request is incomplete.');
    }
    return existing;
  }

  private async completeRequest(
    client: PoolClient,
    interactionId: string,
    listingId: string,
  ): Promise<void> {
    const result = await client.query(
      `UPDATE marketplace_requests
       SET listing_id = $2, completed = true
       WHERE interaction_id = $1 AND completed = false`,
      [interactionId, listingId],
    );
    if (result.rowCount !== 1) {
      throw new Error('Marketplace idempotency record could not be completed.');
    }
  }

  private async ensureAndLockUsers(
    client: PoolClient,
    discordUserIds: readonly string[],
  ): Promise<void> {
    const userIds = [...new Set(discordUserIds)].sort();
    for (const discordUserId of userIds) {
      await client.query(
        `INSERT INTO discord_users (discord_user_id)
         VALUES ($1)
         ON CONFLICT (discord_user_id) DO NOTHING`,
        [discordUserId],
      );
    }
    for (const discordUserId of userIds) {
      const result = await client.query<{ readonly discord_user_id: string }>(
        `SELECT discord_user_id
         FROM discord_users
         WHERE discord_user_id = $1
         FOR UPDATE`,
        [discordUserId],
      );
      if (result.rows[0] === undefined) {
        throw new Error('Discord user row could not be locked for a marketplace operation.');
      }
    }
  }

  private async readListing(
    client: PoolClient,
    listingId: string | null,
  ): Promise<MarketplaceListing> {
    if (listingId === null) {
      throw new Error('Marketplace request has no associated listing.');
    }
    const result = await client.query<ListingRow>(
      `${listingSelect} WHERE listing.listing_id = $1`,
      [listingId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new MarketplaceListingNotFoundError();
    }
    return this.toListing(row);
  }

  private async readPurchase(
    client: PoolClient,
    interactionId: string,
    replayed: boolean,
  ): Promise<MarketplacePurchaseResult> {
    const result = await client.query<ExistingSaleRow>(
      `SELECT ${listingColumns},
              sale.total_price,
              sale.buyer_balance_after,
              sale.seller_balance_after
       FROM marketplace_sales AS sale
       INNER JOIN marketplace_listings AS listing ON listing.listing_id = sale.listing_id
       INNER JOIN shop_catalog AS item ON item.item_id = listing.item_id
       WHERE sale.interaction_id = $1`,
      [interactionId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Marketplace purchase replay has no completed sale record.');
    }
    return {
      listing: this.toListing(row),
      totalPrice: BigInt(row.total_price),
      buyerBalance: BigInt(row.buyer_balance_after),
      sellerBalance: BigInt(row.seller_balance_after),
      replayed,
    };
  }

  private toPage(
    rows: readonly ListingRow[],
    totalListingsValue: string,
    page: number,
  ): MarketplaceListingPage {
    const totalListings = Number(totalListingsValue);
    if (!Number.isSafeInteger(totalListings)) {
      throw new Error('Marketplace listing count exceeded the supported range.');
    }
    return {
      listings: rows.map((row) => this.toListing(row)),
      page,
      pageSize: PAGE_SIZE,
      totalListings,
      totalPages: Math.max(1, Math.ceil(totalListings / PAGE_SIZE)),
    };
  }

  private toListing(row: ListingRow): MarketplaceListing {
    if (!['ACTIVE', 'SOLD', 'CANCELLED'].includes(row.status)) {
      throw new Error('Marketplace listing has an unsupported status.');
    }
    if (!['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(row.rarity)) {
      throw new Error('Marketplace item has an unsupported rarity.');
    }
    return {
      listingId: row.listing_id,
      sellerUserId: row.seller_user_id,
      itemId: row.item_id,
      displayName: row.display_name,
      category: row.category,
      rarity: row.rarity as ShopRarity,
      quantity: row.quantity,
      unitPrice: BigInt(row.unit_price),
      status: row.status as MarketplaceStatus,
      createdAt: row.created_at,
    };
  }

  private fingerprint(...parts: readonly string[]): string {
    return createHash('sha256').update(parts.join('\u0000')).digest('hex');
  }

  private validatePage(page: number): void {
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
      throw new MarketplacePageError();
    }
  }

  private validateItemId(itemId: string): void {
    if (!itemIdPattern.test(itemId)) {
      throw new MarketplaceItemNotOwnedError();
    }
  }

  private validateListingId(listingId: string): void {
    if (!listingIdPattern.test(listingId) || BigInt(listingId) > MAX_POSTGRES_BIGINT) {
      throw new MarketplaceListingNotFoundError();
    }
  }

  private validateQuantity(quantity: number): void {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_INVENTORY_STACK) {
      throw new MarketplaceQuantityError();
    }
  }

  private validatePrice(unitPrice: bigint, quantity: number): void {
    if (
      typeof unitPrice !== 'bigint' ||
      unitPrice < 1n ||
      unitPrice > MAX_POSTGRES_BIGINT ||
      unitPrice * BigInt(quantity) > MAX_POSTGRES_BIGINT
    ) {
      throw new MarketplacePriceError();
    }
  }
}

const listingColumns = `listing.listing_id,
                        listing.seller_user_id,
                        listing.item_id,
                        item.display_name,
                        item.category,
                        item.rarity,
                        listing.quantity,
                        listing.unit_price,
                        listing.status,
                        listing.created_at`;

const listingSelect = `SELECT ${listingColumns}
                        FROM marketplace_listings AS listing
                        INNER JOIN shop_catalog AS item ON item.item_id = listing.item_id`;
