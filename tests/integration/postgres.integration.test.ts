import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BalletService } from '../../src/ballet/ballet-service.js';
import {
  BalletActivityLockedError,
  BalletActivityRequirementError,
  BalletCooldownError,
} from '../../src/ballet/errors.js';
import { PostgresDiscordUserRepository } from '../../src/database/discord-user.repository.js';
import { loadMigrations, runMigrations } from '../../src/database/migrations/runner.js';
import { withClientTransaction, withTransaction } from '../../src/database/transaction.js';
import { EconomyService } from '../../src/economy/economy-service.js';
import { DailyCooldownError } from '../../src/economy/daily-errors.js';
import { DailyService } from '../../src/economy/daily-service.js';
import {
  IdempotencyConflictError,
  InsufficientBalletSlippersError,
} from '../../src/economy/errors.js';
import { createIsolatedTestPool } from '../support/test-database.js';
import { ShopItemAlreadyOwnedError } from '../../src/shop/errors.js';
import { ShopService } from '../../src/shop/shop-service.js';
import { InventoryService } from '../../src/inventory/inventory-service.js';
import { WardrobeItemNotOwnedError } from '../../src/wardrobe/errors.js';
import { WardrobeService } from '../../src/wardrobe/wardrobe-service.js';
import {
  MarketplaceItemEquippedError,
  MarketplaceItemNotOwnedError,
  MarketplaceListingUnavailableError,
  MarketplaceNotSellerError,
  MarketplaceSelfPurchaseError,
} from '../../src/marketplace/errors.js';
import { MarketplaceService } from '../../src/marketplace/marketplace-service.js';

const integrationDescribe = process.env.NOELIA_TEST_DATABASE_URL ? describe : describe.skip;

function testSnowflake(): string {
  const randomHex = randomUUID().replaceAll('-', '').slice(0, 15);
  return (BigInt(`0x${randomHex}`) + 1_000_000_000_000_000_000n).toString();
}

async function giveStarterBow(pool: Pool, discordUserId: string): Promise<void> {
  const economy = new EconomyService(pool);
  await economy.credit({
    interactionId: testSnowflake(),
    discordUserId,
    amount: 80n,
    reason: 'DAILY_REWARD',
  });
  await new ShopService(pool, economy).purchase(
    testSnowflake(),
    discordUserId,
    'satin-ribbon-bow',
    1,
  );
}

integrationDescribe('isolated PostgreSQL integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIsolatedTestPool(process.env);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('upgrades a Phase-1 V1–V6 schema to the latest migration without resetting it', async () => {
    const schemaName = `noelia_upgrade_${randomUUID().replaceAll('-', '')}`;
    await pool.query(`CREATE SCHEMA ${schemaName}`);
    const upgradePool = new Pool({
      connectionString: process.env.NOELIA_TEST_DATABASE_URL,
      options: `-c search_path=${schemaName}`,
      max: 2,
    });

    try {
      await upgradePool.query(`
        CREATE TABLE noelia_schema_migrations (
          version integer PRIMARY KEY CHECK (version > 0),
          name text NOT NULL,
          checksum char(64) NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      const migrations = await loadMigrations(resolve(process.cwd(), 'migrations'));
      for (const migration of migrations.slice(0, 6)) {
        await withTransaction(upgradePool, async (client) => {
          await client.query(migration.sql);
          await client.query(
            `INSERT INTO noelia_schema_migrations (version, name, checksum)
             VALUES ($1, $2, $3)`,
            [migration.version, migration.name, migration.checksum],
          );
        });
      }

      const legacyUserId = testSnowflake();
      const legacyInteractionId = testSnowflake();
      const requestFingerprint = 'a'.repeat(64);
      await upgradePool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [
        legacyUserId,
      ]);
      await upgradePool.query(
        `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
         VALUES ($1, 42, 1)`,
        [legacyUserId],
      );
      const walletTransaction = await upgradePool.query<{ readonly id: string }>(
        `INSERT INTO wallet_transactions (idempotency_key, operation_type, request_fingerprint)
         VALUES ($1, 'BALLET_ACTIVITY', $2)
         RETURNING id`,
        [legacyInteractionId, requestFingerprint],
      );
      await upgradePool.query(
        `INSERT INTO ballet_activity_completions (
           interaction_id, discord_user_id, activity_code, request_fingerprint,
           xp_awarded, slippers_awarded, total_xp_after, level_after,
           wallet_transaction_id, completed_at, next_available_at
         ) VALUES ($1, $2, 'stretching', $3, 8, 10, 8, 1, $4, now(), now() + interval '30 minutes')`,
        [legacyInteractionId, legacyUserId, requestFingerprint, walletTransaction.rows[0]?.id],
      );

      await expect(runMigrations(upgradePool)).resolves.toEqual({
        appliedCount: 2,
        currentVersion: 8,
      });
      await expect(
        upgradePool.query(
          `SELECT stat_value FROM ballet_stats
           WHERE discord_user_id = $1 AND stat_key = 'flexibility'`,
          [legacyUserId],
        ),
      ).resolves.toMatchObject({ rows: [{ stat_value: 2 }] });
      await expect(
        upgradePool.query(
          `SELECT stat_key FROM ballet_activity_completions WHERE interaction_id = $1`,
          [legacyInteractionId],
        ),
      ).resolves.toMatchObject({ rows: [{ stat_key: null }] });
    } finally {
      await upgradePool.end();
      await pool.query(`DROP SCHEMA ${schemaName} CASCADE`);
    }
  });

  it('applies migrations idempotently and persists Discord user identity', async () => {
    const migrationResult = await runMigrations(pool);
    const repository = new PostgresDiscordUserRepository(pool);
    const discordUserId = '987654321098765432';
    const first = await repository.findOrCreate(discordUserId);
    const second = await repository.findOrCreate(discordUserId);

    expect(migrationResult).toEqual({ appliedCount: 0, currentVersion: 8 });
    expect(first.discordUserId).toBe(discordUserId);
    expect(second).toEqual(first);
  });

  it('rolls back PostgreSQL work on the same checked-out client', async () => {
    const client = await pool.connect();
    const failure = new Error('expected rollback');

    try {
      await expect(
        withClientTransaction(client, async (transactionClient) => {
          await transactionClient.query('CREATE TEMP TABLE noelia_rollback_probe (id integer)');
          throw failure;
        }),
      ).rejects.toBe(failure);

      const result = await client.query<{ exists: boolean }>(
        "SELECT to_regclass('pg_temp.noelia_rollback_probe') IS NOT NULL AS exists",
      );
      expect(result.rows[0]?.exists).toBe(false);
    } finally {
      client.release();
    }
  });

  it('serializes concurrent spending so a wallet never becomes negative', async () => {
    const service = new EconomyService(pool);
    const discordUserId = testSnowflake();

    await service.credit({
      interactionId: testSnowflake(),
      discordUserId,
      amount: 100n,
      reason: 'DAILY_REWARD',
    });

    const spendResults = await Promise.allSettled([
      service.spend({
        interactionId: testSnowflake(),
        discordUserId,
        amount: 80n,
        reason: 'SHOP_PURCHASE',
      }),
      service.spend({
        interactionId: testSnowflake(),
        discordUserId,
        amount: 80n,
        reason: 'SHOP_PURCHASE',
      }),
    ]);

    expect(spendResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = spendResults.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.any(InsufficientBalletSlippersError),
    });
    await expect(service.getBalance(discordUserId)).resolves.toBe(20n);
    await expect(service.getLedger(discordUserId)).resolves.toHaveLength(2);
  });

  it('rolls back wallet, idempotency, and ledger writes with the caller transaction', async () => {
    const service = new EconomyService(pool);
    const discordUserId = testSnowflake();
    const client = await pool.connect();
    const failure = new Error('expected economy rollback');

    try {
      await expect(
        withClientTransaction(client, async (transactionClient) => {
          await service.creditWithinTransaction(transactionClient, {
            interactionId: testSnowflake(),
            discordUserId,
            amount: 300n,
            reason: 'BALLET_ACTIVITY',
          });
          throw failure;
        }),
      ).rejects.toBe(failure);
    } finally {
      client.release();
    }

    await expect(service.getBalance(discordUserId)).resolves.toBe(0n);
    await expect(service.getLedger(discordUserId)).resolves.toHaveLength(0);
  });

  it('awards one daily reward, replays safely, and enforces the rolling cooldown', async () => {
    const economy = new EconomyService(pool);
    const daily = new DailyService(pool, economy);
    const discordUserId = testSnowflake();
    const interactionId = testSnowflake();

    const firstClaim = await daily.claimDaily(interactionId, discordUserId);
    const replay = await daily.claimDaily(interactionId, discordUserId);

    expect(firstClaim.rewardAmount).toBe(100n);
    expect(firstClaim.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.balance).toBe(firstClaim.balance);
    await expect(daily.claimDaily(testSnowflake(), discordUserId)).rejects.toBeInstanceOf(
      DailyCooldownError,
    );
    await expect(economy.getBalance(discordUserId)).resolves.toBe(100n);
    await expect(economy.getLedger(discordUserId)).resolves.toHaveLength(1);
  });

  it('persists Ballet XP and rewards, replays safely, and enforces unlocks and cooldowns', async () => {
    const economy = new EconomyService(pool);
    const ballet = new BalletService(pool, economy);
    const discordUserId = testSnowflake();
    const interactionId = testSnowflake();

    const firstPractice = await ballet.practice(interactionId, discordUserId, 'stretching');
    const replay = await ballet.practice(interactionId, discordUserId, 'stretching');

    expect(firstPractice.xpAwarded).toBe(8n);
    expect(firstPractice.slippersAwarded).toBe(10n);
    expect(firstPractice.totalXp).toBe(8n);
    expect(firstPractice.stat).toEqual({ key: 'flexibility', gain: 2, value: 2 });
    expect(replay.replayed).toBe(true);
    expect(replay.stat).toEqual(firstPractice.stat);
    await expect(
      ballet.practice(testSnowflake(), discordUserId, 'stretching'),
    ).rejects.toBeInstanceOf(BalletCooldownError);
    await expect(
      ballet.practice(testSnowflake(), discordUserId, 'center-practice'),
    ).rejects.toBeInstanceOf(BalletActivityLockedError);
    await expect(ballet.getProgress(discordUserId)).resolves.toMatchObject({
      totalXp: 8n,
      level: 1,
      stats: { flexibility: 2 },
    });
    await expect(economy.getBalance(discordUserId)).resolves.toBe(10n);
    await expect(economy.getLedger(discordUserId)).resolves.toHaveLength(1);
  });

  it('enforces pointe equipment and activity unlocks while persisting capped stats', async () => {
    const economy = new EconomyService(pool);
    const ballet = new BalletService(pool, economy);
    const shop = new ShopService(pool, economy);
    const wardrobe = new WardrobeService(pool);
    const discordUserId = testSnowflake();
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [discordUserId]);
    await pool.query(
      `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
       VALUES ($1, 600, 7)`,
      [discordUserId],
    );

    const activitiesBeforeRequirements = await ballet.listActivities(discordUserId);
    expect(activitiesBeforeRequirements).toContainEqual(
      expect.objectContaining({
        code: 'pointe-practice',
        availability: 'LOCKED',
        lockReason: 'REQUIREMENT',
        requiredEquippedItemId: 'pearl-pointe-shoes',
      }),
    );
    expect(activitiesBeforeRequirements).toContainEqual(
      expect.objectContaining({
        code: 'choreography',
        availability: 'LOCKED',
        lockReason: 'REQUIREMENT',
        requiredActivityCode: 'center-practice',
      }),
    );
    await expect(
      ballet.practice(testSnowflake(), discordUserId, 'pointe-practice'),
    ).rejects.toBeInstanceOf(BalletActivityRequirementError);

    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId,
      amount: 500n,
      reason: 'DAILY_REWARD',
    });
    await shop.purchase(testSnowflake(), discordUserId, 'pearl-pointe-shoes', 1);
    await wardrobe.equip(discordUserId, 'pearl-pointe-shoes');
    const pointe = await ballet.practice(testSnowflake(), discordUserId, 'pointe-practice');
    expect(pointe.stat).toEqual({ key: 'pointe', gain: 3, value: 3 });

    await expect(
      ballet.practice(testSnowflake(), discordUserId, 'choreography'),
    ).rejects.toBeInstanceOf(BalletActivityRequirementError);
    await ballet.practice(testSnowflake(), discordUserId, 'center-practice');
    const choreography = await ballet.practice(testSnowflake(), discordUserId, 'choreography');
    expect(choreography.stat).toEqual({ key: 'musicality', gain: 3, value: 3 });

    await pool.query(
      `UPDATE ballet_stats SET stat_value = 99
       WHERE discord_user_id = $1 AND stat_key = 'flexibility'`,
      [discordUserId],
    );
    const stretching = await ballet.practice(testSnowflake(), discordUserId, 'stretching');
    expect(stretching.stat).toEqual({ key: 'flexibility', gain: 1, value: 100 });
    await expect(ballet.getProgress(discordUserId)).resolves.toMatchObject({
      stats: { pointe: 3, musicality: 5, flexibility: 100 },
    });
  });

  it('serializes duplicate concurrent Ballet reward interactions', async () => {
    const economy = new EconomyService(pool);
    const ballet = new BalletService(pool, economy);
    const discordUserId = testSnowflake();
    const interactionId = testSnowflake();

    const results = await Promise.all([
      ballet.practice(interactionId, discordUserId, 'stretching'),
      ballet.practice(interactionId, discordUserId, 'stretching'),
    ]);

    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    await expect(ballet.getProgress(discordUserId)).resolves.toMatchObject({
      totalXp: 8n,
      stats: { flexibility: 2 },
    });
    await expect(economy.getBalance(discordUserId)).resolves.toBe(10n);
    await expect(economy.getLedger(discordUserId)).resolves.toHaveLength(1);
  });

  it('purchases a seeded shop item atomically and safely replays the interaction', async () => {
    const economy = new EconomyService(pool);
    const shop = new ShopService(pool, economy);
    const discordUserId = testSnowflake();
    const creditInteractionId = testSnowflake();
    const purchaseInteractionId = testSnowflake();

    await economy.credit({
      interactionId: creditInteractionId,
      discordUserId,
      amount: 100n,
      reason: 'DAILY_REWARD',
    });

    const purchase = await shop.purchase(
      purchaseInteractionId,
      discordUserId,
      'satin-ribbon-bow',
      1,
    );
    const replay = await shop.purchase(purchaseInteractionId, discordUserId, 'satin-ribbon-bow', 1);

    expect(purchase).toMatchObject({
      item: { itemId: 'satin-ribbon-bow' },
      totalPrice: 80n,
      inventoryQuantity: 1,
      walletBalance: 20n,
      replayed: false,
    });
    expect(replay).toMatchObject({
      totalPrice: 80n,
      inventoryQuantity: 1,
      walletBalance: 20n,
      replayed: true,
    });
    await expect(economy.getBalance(discordUserId)).resolves.toBe(20n);
    await expect(
      pool.query<{ quantity: number }>(
        `SELECT quantity FROM user_inventory
         WHERE discord_user_id = $1 AND item_id = $2`,
        [discordUserId, 'satin-ribbon-bow'],
      ),
    ).resolves.toMatchObject({ rows: [{ quantity: 1 }] });
    await expect(
      shop.purchase(testSnowflake(), discordUserId, 'satin-ribbon-bow', 1),
    ).rejects.toBeInstanceOf(ShopItemAlreadyOwnedError);
    await expect(economy.getBalance(discordUserId)).resolves.toBe(20n);
  });

  it('persists inventory pages and only equips items the user owns', async () => {
    const economy = new EconomyService(pool);
    const shop = new ShopService(pool, economy);
    const inventory = new InventoryService(pool);
    const wardrobe = new WardrobeService(pool);
    const discordUserId = testSnowflake();

    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId,
      amount: 100n,
      reason: 'DAILY_REWARD',
    });
    await shop.purchase(testSnowflake(), discordUserId, 'satin-ribbon-bow', 1);

    await expect(inventory.listInventory(discordUserId, 1)).resolves.toMatchObject({
      page: 1,
      totalItems: 1,
      totalPages: 1,
      entries: [{ itemId: 'satin-ribbon-bow', quantity: 1, source: 'SHOP_PURCHASE' }],
    });
    await expect(wardrobe.equip(discordUserId, 'satin-ribbon-bow')).resolves.toMatchObject({
      itemId: 'satin-ribbon-bow',
      slots: ['hair_accessory'],
      displacedItems: [],
    });
    await expect(wardrobe.getOutfit(discordUserId)).resolves.toMatchObject([
      { itemId: 'satin-ribbon-bow', slots: ['hair_accessory'] },
    ]);
    await expect(wardrobe.equip(discordUserId, 'soft-pink-leotard')).rejects.toBeInstanceOf(
      WardrobeItemNotOwnedError,
    );
    await expect(wardrobe.unequip(discordUserId, 'hair_accessory')).resolves.toMatchObject({
      itemId: 'satin-ribbon-bow',
      slots: ['hair_accessory'],
    });
    await expect(wardrobe.getOutfit(discordUserId)).resolves.toEqual([]);
  });

  it('escrows a listed item and cancellation restores it exactly once', async () => {
    const seller = testSnowflake();
    await giveStarterBow(pool, seller);
    const originalInventory = await pool.query<{
      readonly source: string;
      readonly acquired_at: Date;
    }>(
      `SELECT source, acquired_at FROM user_inventory
       WHERE discord_user_id = $1 AND item_id = 'satin-ribbon-bow'`,
      [seller],
    );
    const market = new MarketplaceService(pool, new EconomyService(pool));
    const createId = testSnowflake();
    const listing = await market.createListing(createId, seller, 'satin-ribbon-bow', 1, 125n);
    const replay = await market.createListing(createId, seller, 'satin-ribbon-bow', 1, 125n);

    expect(listing).toMatchObject({
      replayed: false,
      listing: { sellerUserId: seller, itemId: 'satin-ribbon-bow', status: 'ACTIVE' },
    });
    expect(replay).toMatchObject({
      replayed: true,
      listing: { listingId: listing.listing.listingId },
    });
    await expect(
      market.createListing(createId, seller, 'satin-ribbon-bow', 1, 126n),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(
      market.createListing(testSnowflake(), seller, 'satin-ribbon-bow', 1, 125n),
    ).rejects.toBeInstanceOf(MarketplaceItemNotOwnedError);
    await expect(
      pool.query(`SELECT listing_id FROM marketplace_escrow WHERE listing_id = $1`, [
        listing.listing.listingId,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(
        `SELECT quantity FROM user_inventory
         WHERE discord_user_id = $1 AND item_id = 'satin-ribbon-bow'`,
        [seller],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(market.browse(1)).resolves.toMatchObject({
      totalListings: expect.any(Number),
      listings: expect.arrayContaining([
        expect.objectContaining({ listingId: listing.listing.listingId }),
      ]),
    });
    await expect(market.listMine(seller, 1)).resolves.toMatchObject({
      listings: [expect.objectContaining({ status: 'ACTIVE' })],
    });

    const cancelId = testSnowflake();
    await expect(market.cancel(cancelId, seller, listing.listing.listingId)).resolves.toMatchObject(
      {
        replayed: false,
        listing: { status: 'CANCELLED' },
      },
    );
    await expect(market.cancel(cancelId, seller, listing.listing.listingId)).resolves.toMatchObject(
      {
        replayed: true,
        listing: { status: 'CANCELLED' },
      },
    );
    await expect(
      market.buy(testSnowflake(), testSnowflake(), listing.listing.listingId),
    ).rejects.toBeInstanceOf(MarketplaceListingUnavailableError);
    await expect(
      pool.query(
        `SELECT quantity, source, acquired_at FROM user_inventory
         WHERE discord_user_id = $1 AND item_id = 'satin-ribbon-bow'`,
        [seller],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          quantity: 1,
          source: originalInventory.rows[0]?.source,
          acquired_at: originalInventory.rows[0]?.acquired_at,
        },
      ],
    });
    await expect(
      pool.query(`SELECT listing_id FROM marketplace_escrow WHERE listing_id = $1`, [
        listing.listing.listingId,
      ]),
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it('buys through escrow with two ledger entries and replays without another transfer', async () => {
    const economy = new EconomyService(pool);
    const market = new MarketplaceService(pool, economy);
    const seller = testSnowflake();
    const buyer = testSnowflake();
    await giveStarterBow(pool, seller);
    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId: buyer,
      amount: 200n,
      reason: 'DAILY_REWARD',
    });
    const { listing } = await market.createListing(
      testSnowflake(),
      seller,
      'satin-ribbon-bow',
      1,
      125n,
    );
    const interactionId = testSnowflake();

    const purchase = await market.buy(interactionId, buyer, listing.listingId);
    const replay = await market.buy(interactionId, buyer, listing.listingId);

    expect(purchase).toMatchObject({
      totalPrice: 125n,
      buyerBalance: 75n,
      sellerBalance: 125n,
      replayed: false,
      listing: { status: 'SOLD' },
    });
    await expect(
      market.buy(testSnowflake(), testSnowflake(), listing.listingId),
    ).rejects.toBeInstanceOf(MarketplaceListingUnavailableError);
    expect(replay).toMatchObject({
      totalPrice: 125n,
      buyerBalance: 75n,
      sellerBalance: 125n,
      replayed: true,
      listing: { status: 'SOLD' },
    });
    await expect(economy.getBalance(buyer)).resolves.toBe(75n);
    await expect(economy.getBalance(seller)).resolves.toBe(125n);
    await expect(
      pool.query(
        `SELECT amount_delta FROM wallet_ledger
         WHERE transaction_id = (
           SELECT wallet_transaction_id FROM marketplace_sales WHERE interaction_id = $1
         )
         ORDER BY amount_delta::bigint`,
        [interactionId],
      ),
    ).resolves.toMatchObject({ rows: [{ amount_delta: '-125' }, { amount_delta: '125' }] });
    await expect(
      pool.query(
        `SELECT quantity, source FROM user_inventory
         WHERE discord_user_id = $1 AND item_id = 'satin-ribbon-bow'`,
        [buyer],
      ),
    ).resolves.toMatchObject({ rows: [{ quantity: 1, source: 'MARKETPLACE' }] });
    await expect(
      pool.query(`SELECT listing_id FROM marketplace_escrow WHERE listing_id = $1`, [
        listing.listingId,
      ]),
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it('rejects self-purchases, non-seller cancellation, and insufficient balances without consuming escrow', async () => {
    const seller = testSnowflake();
    const otherUser = testSnowflake();
    await giveStarterBow(pool, seller);
    const market = new MarketplaceService(pool, new EconomyService(pool));
    const { listing } = await market.createListing(
      testSnowflake(),
      seller,
      'satin-ribbon-bow',
      1,
      125n,
    );

    await expect(market.buy(testSnowflake(), seller, listing.listingId)).rejects.toBeInstanceOf(
      MarketplaceSelfPurchaseError,
    );
    await expect(
      market.cancel(testSnowflake(), otherUser, listing.listingId),
    ).rejects.toBeInstanceOf(MarketplaceNotSellerError);
    const insufficientInteraction = testSnowflake();
    await expect(
      market.buy(insufficientInteraction, otherUser, listing.listingId),
    ).rejects.toBeInstanceOf(InsufficientBalletSlippersError);
    await expect(market.browse(1)).resolves.toMatchObject({
      listings: [expect.objectContaining({ listingId: listing.listingId, status: 'ACTIVE' })],
    });
    await expect(
      pool.query(`SELECT listing_id FROM marketplace_escrow WHERE listing_id = $1`, [
        listing.listingId,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(
        `SELECT count(*)::int AS total FROM marketplace_requests WHERE interaction_id = $1`,
        [insufficientInteraction],
      ),
    ).resolves.toMatchObject({ rows: [{ total: 0 }] });
  });

  it('serializes concurrent buyers so exactly one receives the escrowed item', async () => {
    const economy = new EconomyService(pool);
    const market = new MarketplaceService(pool, economy);
    const seller = testSnowflake();
    const buyerOne = testSnowflake();
    const buyerTwo = testSnowflake();
    await giveStarterBow(pool, seller);
    for (const buyer of [buyerOne, buyerTwo]) {
      await economy.credit({
        interactionId: testSnowflake(),
        discordUserId: buyer,
        amount: 200n,
        reason: 'DAILY_REWARD',
      });
    }
    const { listing } = await market.createListing(
      testSnowflake(),
      seller,
      'satin-ribbon-bow',
      1,
      125n,
    );

    const results = await Promise.allSettled([
      market.buy(testSnowflake(), buyerOne, listing.listingId),
      market.buy(testSnowflake(), buyerTwo, listing.listingId),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      pool.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM marketplace_sales WHERE listing_id = $1`,
        [listing.listingId],
      ),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
    await expect(
      pool.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM user_inventory
         WHERE item_id = 'satin-ribbon-bow' AND discord_user_id = ANY($1::text[])`,
        [[buyerOne, buyerTwo]],
      ),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
    await expect(new EconomyService(pool).getBalance(seller)).resolves.toBe(125n);
  });

  it('serializes equip versus sell and never leaves an equipped item in escrow', async () => {
    const seller = testSnowflake();
    await giveStarterBow(pool, seller);
    const market = new MarketplaceService(pool, new EconomyService(pool));
    const wardrobe = new WardrobeService(pool);

    const results = await Promise.allSettled([
      market.createListing(testSnowflake(), seller, 'satin-ribbon-bow', 1, 125n),
      wardrobe.equip(seller, 'satin-ribbon-bow'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);

    const escrow = await pool.query<{ readonly listing_id: string }>(
      `SELECT listing_id FROM marketplace_escrow
       WHERE item_id = 'satin-ribbon-bow'
         AND seller_user_id = $1`,
      [seller],
    );
    const equipped = await wardrobe.getOutfit(seller);
    expect(escrow.rows.length + equipped.length).toBe(1);
    if (escrow.rows.length > 0) {
      expect(equipped).toEqual([]);
      expect(results[0]?.status).toBe('fulfilled');
      expect(results[1]?.status).toBe('rejected');
    } else {
      expect(equipped).toHaveLength(1);
      expect(results[1]?.status).toBe('fulfilled');
      expect(results[0]).toMatchObject({
        status: 'rejected',
        reason: expect.any(MarketplaceItemEquippedError),
      });
    }
  });

  it('serializes a cancellation race against purchase into exactly one final state', async () => {
    const economy = new EconomyService(pool);
    const market = new MarketplaceService(pool, economy);
    const seller = testSnowflake();
    const buyer = testSnowflake();
    await giveStarterBow(pool, seller);
    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId: buyer,
      amount: 200n,
      reason: 'DAILY_REWARD',
    });
    const { listing } = await market.createListing(
      testSnowflake(),
      seller,
      'satin-ribbon-bow',
      1,
      125n,
    );

    const results = await Promise.allSettled([
      market.cancel(testSnowflake(), seller, listing.listingId),
      market.buy(testSnowflake(), buyer, listing.listingId),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const state = await pool.query<{ readonly status: string }>(
      `SELECT status FROM marketplace_listings WHERE listing_id = $1`,
      [listing.listingId],
    );
    const status = state.rows[0]?.status;
    expect(['SOLD', 'CANCELLED']).toContain(status);
    await expect(
      pool.query(`SELECT listing_id FROM marketplace_escrow WHERE listing_id = $1`, [
        listing.listingId,
      ]),
    ).resolves.toMatchObject({ rowCount: 0 });
    if (status === 'CANCELLED') {
      await expect(new EconomyService(pool).getBalance(buyer)).resolves.toBe(200n);
      await expect(
        pool.query(
          `SELECT quantity FROM user_inventory
           WHERE discord_user_id = $1 AND item_id = 'satin-ribbon-bow'`,
          [seller],
        ),
      ).resolves.toMatchObject({ rows: [{ quantity: 1 }] });
    } else {
      await expect(new EconomyService(pool).getBalance(buyer)).resolves.toBe(75n);
    }
  });

  it('rolls wallet, inventory, escrow, sale status, and idempotency back after a late DB failure', async () => {
    const economy = new EconomyService(pool);
    const market = new MarketplaceService(pool, economy);
    const seller = testSnowflake();
    const buyer = testSnowflake();
    await giveStarterBow(pool, seller);
    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId: buyer,
      amount: 200n,
      reason: 'DAILY_REWARD',
    });
    const { listing } = await market.createListing(
      testSnowflake(),
      seller,
      'satin-ribbon-bow',
      1,
      125n,
    );
    const interactionId = testSnowflake();
    await pool.query(`
      CREATE FUNCTION noelia_test_reject_marketplace_sale()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'injected marketplace sale failure';
      END;
      $$
    `);
    await pool.query(`
      CREATE TRIGGER noelia_test_reject_marketplace_sale
      BEFORE INSERT ON marketplace_sales
      FOR EACH ROW EXECUTE FUNCTION noelia_test_reject_marketplace_sale()
    `);

    try {
      await expect(market.buy(interactionId, buyer, listing.listingId)).rejects.toThrow(
        'injected marketplace sale failure',
      );
    } finally {
      await pool.query('DROP TRIGGER noelia_test_reject_marketplace_sale ON marketplace_sales');
      await pool.query('DROP FUNCTION noelia_test_reject_marketplace_sale()');
    }

    await expect(economy.getBalance(buyer)).resolves.toBe(200n);
    await expect(economy.getBalance(seller)).resolves.toBe(0n);
    await expect(
      pool.query(`SELECT status FROM marketplace_listings WHERE listing_id = $1`, [
        listing.listingId,
      ]),
    ).resolves.toMatchObject({ rows: [{ status: 'ACTIVE' }] });
    await expect(
      pool.query(`SELECT listing_id FROM marketplace_escrow WHERE listing_id = $1`, [
        listing.listingId,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(`SELECT interaction_id FROM marketplace_requests WHERE interaction_id = $1`, [
        interactionId,
      ]),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      pool.query(`SELECT id FROM wallet_transactions WHERE idempotency_key = $1`, [interactionId]),
    ).resolves.toMatchObject({ rowCount: 0 });
  });
});
