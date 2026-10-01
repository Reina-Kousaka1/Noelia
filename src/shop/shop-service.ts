import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import { withTransaction } from '../database/transaction.js';
import { evaluateCollectionAchievements, unlockAchievement } from '../achievements/unlock.js';
import { IdempotencyConflictError } from '../economy/errors.js';
import type { WalletSpendTransactionPort } from '../economy/ports.js';
import {
  InventoryQuantityLimitError,
  ShopItemAlreadyOwnedError,
  ShopItemUnavailableError,
  ShopLevelRequirementError,
  ShopPriceLimitError,
  ShopPurchaseQuantityError,
} from './errors.js';
import { SHOP_CATEGORIES } from './types.js';
import { parseShopRarity } from './rarity.js';
import type { ShopCategory, ShopItem, ShopPort, ShopPurchaseResult } from './types.js';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const MAX_INVENTORY_STACK = 99_999;
const itemIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface CatalogRow extends QueryResultRow {
  readonly item_id: string;
  readonly display_name: string;
  readonly description: string;
  readonly category: string;
  readonly rarity: string;
  readonly price: string;
  readonly active: boolean;
  readonly purchasable: boolean;
  readonly stackable: boolean;
  readonly minimum_ballet_level: number | null;
  readonly collection: string | null;
  readonly cosmetic_metadata: Record<string, unknown>;
}

interface ExistingPurchaseRow extends CatalogRow {
  readonly discord_user_id: string;
  readonly quantity: number;
  readonly unit_price: string;
  readonly total_price: string;
  readonly request_fingerprint: string;
  readonly inventory_quantity_after: number;
  readonly wallet_balance_after: string;
}

interface UserRow extends QueryResultRow {
  readonly discord_user_id: string;
}

interface LevelRow extends QueryResultRow {
  readonly level: number;
}

interface InventoryRow extends QueryResultRow {
  readonly quantity: number;
}

interface InsertedPurchaseRow extends QueryResultRow {
  readonly purchase_id: string;
}

interface UpdatedInventoryRow extends QueryResultRow {
  readonly quantity: number;
}

export class ShopService implements ShopPort {
  public constructor(
    private readonly pool: Pool,
    private readonly wallet: WalletSpendTransactionPort,
  ) {}

  public async listItems(category?: ShopCategory): Promise<readonly ShopItem[]> {
    if (category !== undefined && !(SHOP_CATEGORIES as readonly string[]).includes(category)) {
      throw new TypeError('Shop category is not recognized.');
    }

    const result = await this.pool.query<CatalogRow>(
      `SELECT item_id, display_name, description, category, rarity, price,
              active, purchasable, stackable, minimum_ballet_level,
              collection, cosmetic_metadata
       FROM shop_catalog
       WHERE active = true AND ($1::text IS NULL OR category = $1)
       ORDER BY category, price, display_name`,
      [category ?? null],
    );

    return result.rows.map((row) => this.toShopItem(row));
  }

  public async getItem(itemId: string): Promise<ShopItem | undefined> {
    if (!itemIdPattern.test(itemId)) {
      return undefined;
    }

    const result = await this.pool.query<CatalogRow>(
      `SELECT item_id, display_name, description, category, rarity, price,
              active, purchasable, stackable, minimum_ballet_level,
              collection, cosmetic_metadata
       FROM shop_catalog
       WHERE item_id = $1 AND active = true`,
      [itemId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : this.toShopItem(row);
  }

  public async purchase(
    interactionId: string,
    discordUserId: string,
    itemId: string,
    quantity: number,
  ): Promise<ShopPurchaseResult> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');

    if (
      !itemIdPattern.test(itemId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_INVENTORY_STACK
    ) {
      throw new ShopPurchaseQuantityError();
    }

    const requestFingerprint = createHash('sha256')
      .update(`${discordUserId}\u0000${itemId}\u0000${quantity}`)
      .digest('hex');

    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUser(client, discordUserId);
      const existingPurchase = await this.findPurchase(client, interactionId);

      if (existingPurchase !== undefined) {
        if (
          existingPurchase.discord_user_id !== discordUserId ||
          existingPurchase.item_id !== itemId ||
          existingPurchase.quantity !== quantity ||
          existingPurchase.request_fingerprint !== requestFingerprint
        ) {
          throw new IdempotencyConflictError();
        }

        return this.toPurchaseResult(existingPurchase, true);
      }

      const itemResult = await client.query<CatalogRow>(
        `SELECT item_id, display_name, description, category, rarity, price,
                active, purchasable, stackable, minimum_ballet_level,
                collection, cosmetic_metadata
         FROM shop_catalog
         WHERE item_id = $1 AND active = true AND purchasable = true
         FOR SHARE`,
        [itemId],
      );
      const itemRow = itemResult.rows[0];

      if (itemRow === undefined) {
        throw new ShopItemUnavailableError();
      }

      if (!itemRow.stackable && quantity !== 1) {
        throw new ShopPurchaseQuantityError();
      }

      if (itemRow.minimum_ballet_level !== null) {
        const levelResult = await client.query<LevelRow>(
          `SELECT level
           FROM ballet_progress
           WHERE discord_user_id = $1`,
          [discordUserId],
        );
        const userLevel = levelResult.rows[0]?.level ?? 1;

        if (userLevel < itemRow.minimum_ballet_level) {
          throw new ShopLevelRequirementError(itemRow.minimum_ballet_level);
        }
      }

      const inventoryResult = await client.query<InventoryRow>(
        `SELECT quantity
         FROM user_inventory
         WHERE discord_user_id = $1 AND item_id = $2
         FOR UPDATE`,
        [discordUserId, itemId],
      );
      const currentQuantity = inventoryResult.rows[0]?.quantity ?? 0;

      if (!itemRow.stackable && currentQuantity > 0) {
        throw new ShopItemAlreadyOwnedError();
      }

      if (currentQuantity + quantity > MAX_INVENTORY_STACK) {
        throw new InventoryQuantityLimitError();
      }

      const unitPrice = BigInt(itemRow.price);
      const totalPrice = unitPrice * BigInt(quantity);

      if (totalPrice > MAX_POSTGRES_BIGINT) {
        throw new ShopPriceLimitError();
      }

      const walletMutation = await this.wallet.spendWithinTransaction(client, {
        interactionId,
        discordUserId,
        amount: totalPrice,
        reason: 'SHOP_PURCHASE',
      });
      const newInventoryQuantity = currentQuantity + quantity;
      const inventoryWrite =
        currentQuantity > 0
          ? await client.query<UpdatedInventoryRow>(
              `UPDATE user_inventory
               SET quantity = $3
               WHERE discord_user_id = $1 AND item_id = $2
               RETURNING quantity`,
              [discordUserId, itemId, newInventoryQuantity],
            )
          : await client.query<UpdatedInventoryRow>(
              `INSERT INTO user_inventory (discord_user_id, item_id, quantity, source)
               VALUES ($1, $2, $3, 'SHOP_PURCHASE')
               RETURNING quantity`,
              [discordUserId, itemId, newInventoryQuantity],
            );
      const inventory = inventoryWrite.rows[0];

      if (inventory === undefined) {
        throw new Error('The purchased item was not added to inventory.');
      }

      const purchaseWrite = await client.query<InsertedPurchaseRow>(
        `INSERT INTO shop_purchases (
           interaction_id, discord_user_id, item_id, quantity,
           unit_price, total_price, request_fingerprint,
           inventory_quantity_after, wallet_transaction_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING purchase_id`,
        [
          interactionId,
          discordUserId,
          itemId,
          quantity,
          unitPrice.toString(),
          totalPrice.toString(),
          requestFingerprint,
          inventory.quantity,
          walletMutation.transactionId,
        ],
      );

      if (purchaseWrite.rows[0] === undefined) {
        throw new Error('The shop purchase history entry could not be recorded.');
      }

      await unlockAchievement(
        client,
        discordUserId,
        'first-boutique-piece',
        'SHOP_PURCHASE',
        interactionId,
      );
      await evaluateCollectionAchievements(client, discordUserId, interactionId);

      return {
        item: this.toShopItem(itemRow),
        quantity,
        unitPrice,
        totalPrice,
        inventoryQuantity: inventory.quantity,
        walletBalance: walletMutation.balance,
        replayed: false,
      };
    });
  }

  private async ensureAndLockUser(client: PoolClient, discordUserId: string): Promise<void> {
    await client.query(
      `INSERT INTO discord_users (discord_user_id)
       VALUES ($1)
       ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
    const result = await client.query<UserRow>(
      `SELECT discord_user_id
       FROM discord_users
       WHERE discord_user_id = $1
       FOR UPDATE`,
      [discordUserId],
    );

    if (result.rows[0] === undefined) {
      throw new Error('Discord user row could not be locked for a shop purchase.');
    }
  }

  private async findPurchase(
    client: PoolClient,
    interactionId: string,
  ): Promise<ExistingPurchaseRow | undefined> {
    const result = await client.query<ExistingPurchaseRow>(
      `SELECT purchase.discord_user_id,
              purchase.item_id,
              purchase.quantity,
              purchase.unit_price,
              purchase.total_price,
              purchase.request_fingerprint,
              purchase.inventory_quantity_after,
              item.display_name,
              item.description,
              item.category,
              item.rarity,
              item.price,
              item.active,
              item.purchasable,
              item.stackable,
              item.minimum_ballet_level,
              item.collection,
              item.cosmetic_metadata,
              ledger.balance_after AS wallet_balance_after
       FROM shop_purchases AS purchase
       INNER JOIN shop_catalog AS item ON item.item_id = purchase.item_id
       INNER JOIN wallet_ledger AS ledger
         ON ledger.transaction_id = purchase.wallet_transaction_id
        AND ledger.discord_user_id = purchase.discord_user_id
       WHERE purchase.interaction_id = $1`,
      [interactionId],
    );

    return result.rows[0];
  }

  private toPurchaseResult(row: ExistingPurchaseRow, replayed: boolean): ShopPurchaseResult {
    return {
      item: this.toShopItem(row),
      quantity: row.quantity,
      unitPrice: BigInt(row.unit_price),
      totalPrice: BigInt(row.total_price),
      inventoryQuantity: row.inventory_quantity_after,
      walletBalance: BigInt(row.wallet_balance_after),
      replayed,
    };
  }

  private toShopItem(row: CatalogRow): ShopItem {
    return {
      itemId: row.item_id,
      displayName: row.display_name,
      description: row.description,
      category: row.category as ShopCategory,
      rarity: parseShopRarity(row.rarity),
      price: BigInt(row.price),
      active: row.active,
      purchasable: row.purchasable,
      stackable: row.stackable,
      minimumBalletLevel: row.minimum_ballet_level,
      collection: row.collection,
      cosmeticMetadata: row.cosmetic_metadata,
    };
  }
}
