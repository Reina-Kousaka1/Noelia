import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  InsufficientBalletSlippersError,
  IdempotencyConflictError,
} from '../../src/economy/errors.js';
import type { WalletMutationResult } from '../../src/economy/types.js';
import {
  InventoryQuantityLimitError,
  ShopItemAlreadyOwnedError,
  ShopLevelRequirementError,
  ShopPurchaseQuantityError,
} from '../../src/shop/errors.js';
import { ShopService } from '../../src/shop/shop-service.js';

const discordUserId = '222222222222222222';
const interactionId = '111111111111111111';

interface CatalogFixture {
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

interface PurchaseFixture extends CatalogFixture {
  readonly discord_user_id: string;
  readonly quantity: number;
  readonly unit_price: string;
  readonly total_price: string;
  readonly request_fingerprint: string;
  readonly inventory_quantity_after: number;
  readonly wallet_balance_after: string;
}

const ribbonBow: CatalogFixture = {
  item_id: 'satin-ribbon-bow',
  display_name: 'Satin Ribbon Bow',
  description: 'A soft blush satin bow for a neat studio bun.',
  category: 'hair_accessory',
  rarity: 'common',
  price: '80',
  active: true,
  purchasable: true,
  stackable: false,
  minimum_ballet_level: 1,
  collection: 'First Position',
  cosmetic_metadata: { color: 'blush-pink', slots: ['hair_accessory'] },
};

function fingerprint(userId: string, itemId: string, quantity: number): string {
  return createHash('sha256').update(`${userId}\u0000${itemId}\u0000${quantity}`).digest('hex');
}

function createShopService(options?: {
  readonly item?: CatalogFixture;
  readonly items?: readonly CatalogFixture[];
  readonly currentQuantity?: number;
  readonly userLevel?: number;
  readonly existingPurchase?: PurchaseFixture;
  readonly walletResult?: WalletMutationResult;
  readonly walletError?: Error;
}) {
  const item = options?.item ?? ribbonBow;
  const items = options?.items ?? [item];
  const statements: string[] = [];
  const query = vi.fn(async (rawSql: string, values: unknown[] = []) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    statements.push(sql);

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO discord_users')) {
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO user_achievements') || sql.startsWith('WITH owned_items AS')) {
      return { rows: [] };
    }
    if (sql.startsWith('SELECT discord_user_id FROM discord_users')) {
      return { rows: [{ discord_user_id: discordUserId }] };
    }
    if (sql.startsWith('SELECT purchase.discord_user_id')) {
      return {
        rows: options?.existingPurchase === undefined ? [] : [options.existingPurchase],
      };
    }
    if (sql.includes('FROM shop_catalog') && sql.includes('FOR SHARE')) {
      const selected = items.find((candidate) => candidate.item_id === String(values[0]));
      return { rows: selected === undefined ? [] : [selected] };
    }
    if (sql.startsWith('SELECT level FROM ballet_progress')) {
      return {
        rows: options?.userLevel === undefined ? [] : [{ level: options.userLevel }],
      };
    }
    if (sql.startsWith('SELECT quantity FROM user_inventory')) {
      return {
        rows: options?.currentQuantity === undefined ? [] : [{ quantity: options.currentQuantity }],
      };
    }
    if (sql.startsWith('UPDATE user_inventory') || sql.startsWith('INSERT INTO user_inventory')) {
      return { rows: [{ quantity: Number(values[2]) }] };
    }
    if (sql.startsWith('INSERT INTO shop_purchases')) {
      return { rows: [{ purchase_id: '7001' }] };
    }
    if (sql.includes('WHERE active = true AND ($1::text IS NULL OR category = $1)')) {
      return {
        rows:
          values[0] === null
            ? items
            : items.filter((candidate) => candidate.category === String(values[0])),
      };
    }
    if (sql.includes('WHERE item_id = $1 AND active = true')) {
      const selected = items.find((candidate) => candidate.item_id === String(values[0]));
      return { rows: selected === undefined ? [] : [selected] };
    }

    throw new Error(`Unexpected test SQL: ${sql}`);
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = {
    query,
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  const spendWithinTransaction = vi.fn().mockImplementation(async () => {
    if (options?.walletError !== undefined) {
      throw options.walletError;
    }
    return (
      options?.walletResult ?? {
        balance: 220n,
        transactionId: '5001',
        replayed: false,
      }
    );
  });
  const service = new ShopService(pool, { spendWithinTransaction });

  return { service, client, spendWithinTransaction, statements, query };
}

describe('ShopService', () => {
  it('debits the wallet, records a purchase, and adds inventory in the same transaction', async () => {
    const database = createShopService();

    await expect(
      database.service.purchase(interactionId, discordUserId, 'satin-ribbon-bow', 1),
    ).resolves.toMatchObject({
      item: { itemId: 'satin-ribbon-bow', displayName: 'Satin Ribbon Bow' },
      quantity: 1,
      unitPrice: 80n,
      totalPrice: 80n,
      inventoryQuantity: 1,
      walletBalance: 220n,
      replayed: false,
    });

    expect(database.spendWithinTransaction).toHaveBeenCalledWith(database.client, {
      interactionId,
      discordUserId,
      amount: 80n,
      reason: 'SHOP_PURCHASE',
    });
    expect(database.statements).toContain('BEGIN');
    expect(database.statements).toContain('COMMIT');
    expect(database.statements.some((sql) => sql.startsWith('INSERT INTO user_inventory'))).toBe(
      true,
    );
    expect(database.statements.some((sql) => sql.startsWith('INSERT INTO shop_purchases'))).toBe(
      true,
    );
  });

  it('replays a completed purchase without charging or adding a second item', async () => {
    const existingPurchase: PurchaseFixture = {
      ...ribbonBow,
      discord_user_id: discordUserId,
      quantity: 1,
      unit_price: '80',
      total_price: '80',
      request_fingerprint: fingerprint(discordUserId, 'satin-ribbon-bow', 1),
      inventory_quantity_after: 1,
      wallet_balance_after: '220',
    };
    const database = createShopService({ existingPurchase });

    await expect(
      database.service.purchase(interactionId, discordUserId, 'satin-ribbon-bow', 1),
    ).resolves.toMatchObject({
      quantity: 1,
      totalPrice: 80n,
      inventoryQuantity: 1,
      walletBalance: 220n,
      replayed: true,
    });
    expect(database.spendWithinTransaction).not.toHaveBeenCalled();
    expect(database.statements.some((sql) => sql.startsWith('INSERT INTO user_inventory'))).toBe(
      false,
    );
  });

  it('rolls back an unaffordable purchase before inventory or purchase writes', async () => {
    const failure = new InsufficientBalletSlippersError(10n, 80n);
    const database = createShopService({ walletError: failure });

    await expect(
      database.service.purchase(interactionId, discordUserId, 'satin-ribbon-bow', 1),
    ).rejects.toBe(failure);
    expect(database.statements).toContain('ROLLBACK');
    expect(database.statements.some((sql) => sql.startsWith('INSERT INTO user_inventory'))).toBe(
      false,
    );
    expect(database.statements.some((sql) => sql.startsWith('INSERT INTO shop_purchases'))).toBe(
      false,
    );
  });

  it('blocks duplicate ownership and Ballet-level requirements before charging', async () => {
    const alreadyOwned = createShopService({ currentQuantity: 1 });
    await expect(
      alreadyOwned.service.purchase(interactionId, discordUserId, 'satin-ribbon-bow', 1),
    ).rejects.toBeInstanceOf(ShopItemAlreadyOwnedError);
    expect(alreadyOwned.spendWithinTransaction).not.toHaveBeenCalled();

    const pointeShoes: CatalogFixture = {
      ...ribbonBow,
      item_id: 'pearl-pointe-shoes',
      display_name: 'Pearl Pointe Shoes',
      category: 'pointe_shoes',
      price: '500',
      minimum_ballet_level: 5,
    };
    const levelLocked = createShopService({
      item: pointeShoes,
      items: [pointeShoes],
      userLevel: 4,
    });
    await expect(
      levelLocked.service.purchase(interactionId, discordUserId, pointeShoes.item_id, 1),
    ).rejects.toBeInstanceOf(ShopLevelRequirementError);
    expect(levelLocked.spendWithinTransaction).not.toHaveBeenCalled();
  });

  it('adds quantities to stackable inventory and protects the stack limit', async () => {
    const stackableItem: CatalogFixture = { ...ribbonBow, stackable: true };
    const database = createShopService({
      item: stackableItem,
      items: [stackableItem],
      currentQuantity: 2,
    });

    await expect(
      database.service.purchase(interactionId, discordUserId, stackableItem.item_id, 3),
    ).resolves.toMatchObject({
      quantity: 3,
      totalPrice: 240n,
      inventoryQuantity: 5,
    });
    expect(database.spendWithinTransaction).toHaveBeenCalledWith(
      database.client,
      expect.objectContaining({ amount: 240n }),
    );
    expect(database.statements.some((sql) => sql.startsWith('UPDATE user_inventory'))).toBe(true);

    const fullStack = createShopService({
      item: stackableItem,
      items: [stackableItem],
      currentQuantity: 99_999,
    });
    await expect(
      fullStack.service.purchase(interactionId, discordUserId, stackableItem.item_id, 1),
    ).rejects.toBeInstanceOf(InventoryQuantityLimitError);
    expect(fullStack.spendWithinTransaction).not.toHaveBeenCalled();
  });

  it('rejects interaction reuse for a different item or quantity', async () => {
    const existingPurchase: PurchaseFixture = {
      ...ribbonBow,
      discord_user_id: discordUserId,
      quantity: 1,
      unit_price: '80',
      total_price: '80',
      request_fingerprint: fingerprint(discordUserId, 'satin-ribbon-bow', 1),
      inventory_quantity_after: 1,
      wallet_balance_after: '220',
    };
    const database = createShopService({ existingPurchase });

    await expect(
      database.service.purchase(interactionId, discordUserId, 'satin-ribbon-bow', 2),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(database.spendWithinTransaction).not.toHaveBeenCalled();
  });

  it('browses a filtered catalog and looks up a stable item ID', async () => {
    const database = createShopService();

    await expect(database.service.listItems('hair_accessory')).resolves.toMatchObject([
      { itemId: 'satin-ribbon-bow', category: 'hair_accessory', price: 80n },
    ]);
    await expect(database.service.getItem('satin-ribbon-bow')).resolves.toMatchObject({
      itemId: 'satin-ribbon-bow',
      cosmeticMetadata: { color: 'blush-pink' },
    });
    await expect(database.service.getItem('../unsafe')).resolves.toBeUndefined();
  });

  it('rejects invalid quantities before opening a database transaction', async () => {
    const database = createShopService();

    await expect(
      database.service.purchase(interactionId, discordUserId, 'satin-ribbon-bow', 0),
    ).rejects.toBeInstanceOf(ShopPurchaseQuantityError);
    expect(database.query).not.toHaveBeenCalled();
  });
});
