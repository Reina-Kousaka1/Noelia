import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BalletService } from '../../src/ballet/ballet-service.js';
import { BalletAcademyService } from '../../src/ballet/academy-service.js';
import {
  AcademyUniformAlreadyClaimedError,
  AcademyUniformRequirementError,
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
import { AchievementNotUnlockedError } from '../../src/achievements/errors.js';
import { AchievementService } from '../../src/achievements/achievement-service.js';
import {
  evaluateCollectionAchievements,
  unlockAchievement,
} from '../../src/achievements/unlock.js';
import { ShopItemAlreadyOwnedError } from '../../src/shop/errors.js';
import { ShopService } from '../../src/shop/shop-service.js';
import { SHOP_CATEGORIES } from '../../src/shop/types.js';
import { SHOP_RARITIES } from '../../src/shop/rarity.js';
import { InventoryService } from '../../src/inventory/inventory-service.js';
import {
  WardrobeItemNotOwnedError,
  WardrobePresetItemsUnavailableError,
  WardrobePresetNameTakenError,
} from '../../src/wardrobe/errors.js';
import { WardrobeService } from '../../src/wardrobe/wardrobe-service.js';
import { WardrobePresetService } from '../../src/wardrobe/preset-service.js';
import {
  MarketplaceItemEquippedError,
  MarketplaceItemNotOwnedError,
  MarketplaceListingUnavailableError,
  MarketplaceNotSellerError,
  MarketplaceSelfPurchaseError,
} from '../../src/marketplace/errors.js';
import { MarketplaceService } from '../../src/marketplace/marketplace-service.js';
import { PerformanceService } from '../../src/performance/performance-service.js';
import { CollectionService } from '../../src/collections/collection-service.js';
import { PerformanceCooldownError, PerformanceLockedError } from '../../src/performance/errors.js';
import { RelationshipService } from '../../src/relationships/relationship-service.js';
import { ProfileService } from '../../src/profile/profile-service.js';
import { ModerationService } from '../../src/moderation/moderation-service.js';
import { ModerationIdempotencyConflictError } from '../../src/moderation/moderation-errors.js';
import { AutomodService } from '../../src/automod/automod-service.js';
import { AutomodIdempotencyConflictError } from '../../src/automod/errors.js';
import { WARDROBE_SLOTS } from '../../src/wardrobe/types.js';
import {
  MarriageParticipantUnavailableError,
  MarriageProposalActorError,
  MarriageProposalUnavailableError,
} from '../../src/relationships/errors.js';

const integrationDescribe = process.env.NOELIA_TEST_DATABASE_URL ? describe : describe.skip;

async function grantAcademyBasics(pool: Pool, discordUserId: string, equip = true): Promise<void> {
  await pool.query(
    `INSERT INTO discord_users (discord_user_id) VALUES ($1)
     ON CONFLICT (discord_user_id) DO NOTHING`,
    [discordUserId],
  );
  const pieces = [
    ['soft-pink-leotard', 'leotard'],
    ['cloud-soft-tights', 'tights'],
    ['classic-ballet-flats', 'shoes'],
  ] as const;
  for (const [itemId, slot] of pieces) {
    await pool.query(
      `INSERT INTO user_inventory (discord_user_id, item_id, quantity, source)
       VALUES ($1, $2, 1, 'ADMIN_GRANT') ON CONFLICT (discord_user_id, item_id) DO NOTHING`,
      [discordUserId, itemId],
    );
    if (equip) {
      await pool.query(
        `INSERT INTO wardrobe_equipment (discord_user_id, slot, item_id)
         VALUES ($1, $2, $3) ON CONFLICT (discord_user_id, slot) DO NOTHING`,
        [discordUserId, slot, itemId],
      );
    }
  }
}

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

  it('upgrades a Phase-1 V1-V6 schema to the latest migration without resetting it', async () => {
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
        appliedCount: 14,
        currentVersion: 20,
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

    expect(migrationResult).toEqual({ appliedCount: 0, currentVersion: 20 });
    expect(first.discordUserId).toBe(discordUserId);
    expect(second).toEqual(first);
  });

  it('persists AutoMod rules and allowlist changes idempotently', async () => {
    const automod = new AutomodService(pool);
    const reloadedAutomod = new AutomodService(pool);
    const guildId = testSnowflake();
    const actorUserId = testSnowflake();
    const allowedUserId = testSnowflake();
    const ruleInteractionId = testSnowflake();
    const ruleConfig = {
      enabled: true,
      threshold: 7,
      windowSeconds: 12,
      escalation: 'CASE' as const,
    };

    const ruleChange = await automod.setRule(
      ruleInteractionId,
      guildId,
      actorUserId,
      'message_flood',
      ruleConfig,
    );
    const ruleReplay = await automod.setRule(
      ruleInteractionId,
      guildId,
      actorUserId,
      'message_flood',
      ruleConfig,
    );
    expect(ruleChange).toMatchObject({
      replayed: false,
      config: { rules: { message_flood: ruleConfig } },
    });
    expect(ruleReplay).toMatchObject({ replayed: true });
    await expect(
      pool.query<{ readonly request_payload: unknown }>(
        'SELECT request_payload FROM automod_config_requests WHERE interaction_id = $1',
        [ruleInteractionId],
      ),
    ).resolves.toMatchObject({
      rows: [{ request_payload: ['message_flood', ruleConfig] }],
    });
    await expect(
      automod.setRule(ruleInteractionId, guildId, actorUserId, 'message_flood', {
        ...ruleConfig,
        threshold: 8,
      }),
    ).rejects.toBeInstanceOf(AutomodIdempotencyConflictError);

    const allowInteractionId = testSnowflake();
    const allowChange = await automod.setAllowlisted(
      allowInteractionId,
      guildId,
      actorUserId,
      allowedUserId,
      true,
    );
    const allowReplay = await automod.setAllowlisted(
      allowInteractionId,
      guildId,
      actorUserId,
      allowedUserId,
      true,
    );
    expect(allowChange.config.allowlistedUserIds).toContain(allowedUserId);
    expect(allowReplay.replayed).toBe(true);

    const persisted = await reloadedAutomod.getConfig(guildId);
    expect(persisted.rules.message_flood).toEqual(ruleConfig);
    expect(persisted.allowlistedUserIds).toEqual([allowedUserId]);

    await automod.setAllowlisted(testSnowflake(), guildId, actorUserId, allowedUserId, false);
    await expect(new AutomodService(pool).getConfig(guildId)).resolves.toMatchObject({
      allowlistedUserIds: [],
    });
    await expect(
      pool.query(
        'UPDATE automod_config_requests SET operation = operation WHERE interaction_id = $1',
        [ruleInteractionId],
      ),
    ).rejects.toThrow('AutoMod configuration request history is immutable');
  });

  it('stores moderation attempts and immutable idempotent outcomes', async () => {
    const moderation = new ModerationService(pool);
    const guildId = testSnowflake();
    const actorUserId = testSnowflake();
    const targetUserId = testSnowflake();
    const interactionId = testSnowflake();
    const input = {
      idempotencyKey: interactionId,
      guildId,
      actorUserId,
      targetUserId,
      action: 'warning' as const,
      source: 'manual' as const,
      reason: 'Repeated off-topic messages',
      occurredAt: new Date(),
    };

    const first = await moderation.createAttempt(input);
    const replay = await moderation.createAttempt(input);
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.case.caseId).toBe(first.case.caseId);
    expect(first.case.outcome).toBeNull();
    await expect(
      moderation.createAttempt({ ...input, reason: 'Different request' }),
    ).rejects.toBeInstanceOf(ModerationIdempotencyConflictError);

    await expect(moderation.recordOutcome(first.case.caseId, 'SUCCEEDED')).resolves.toMatchObject({
      outcome: 'SUCCEEDED',
      outcomeCode: null,
      replayed: false,
    });
    await expect(moderation.recordOutcome(first.case.caseId, 'SUCCEEDED')).resolves.toMatchObject({
      replayed: true,
    });
    await expect(
      moderation.recordOutcome(first.case.caseId, 'FAILED', 'DISCORD_REQUEST_FAILED'),
    ).rejects.toBeInstanceOf(ModerationIdempotencyConflictError);

    await expect(moderation.getCase(guildId, first.case.caseId)).resolves.toMatchObject({
      caseId: first.case.caseId,
      action: 'warning',
      reason: 'Repeated off-topic messages',
      outcome: 'SUCCEEDED',
    });
    await expect(moderation.listCases(guildId, targetUserId, 1, 'warning')).resolves.toMatchObject({
      totalCases: 1,
      totalPages: 1,
      cases: [{ caseId: first.case.caseId, outcome: 'SUCCEEDED' }],
    });
    await expect(
      pool.query('UPDATE moderation_cases SET reason = NULL WHERE case_id = $1', [
        first.case.caseId,
      ]),
    ).rejects.toThrow('moderation case history is immutable');
    await expect(
      pool.query('DELETE FROM moderation_case_outcomes WHERE case_id = $1', [first.case.caseId]),
    ).rejects.toThrow('moderation action outcomes are immutable');
  });

  it('validates the expanded catalog and counts active marketplace escrow in collections', async () => {
    const catalog = await pool.query<{
      readonly item_id: string;
      readonly display_name: string;
      readonly category: string;
      readonly rarity: string;
      readonly price: string;
      readonly collection: string | null;
      readonly cosmetic_metadata: unknown;
    }>(
      `SELECT item_id, display_name, category, rarity, price::text, collection, cosmetic_metadata
       FROM shop_catalog ORDER BY item_id`,
    );
    expect(catalog.rows).toHaveLength(92);
    expect(new Set(catalog.rows.map((item) => item.item_id)).size).toBe(92);
    expect(new Set(catalog.rows.map((item) => item.display_name)).size).toBe(92);

    const collectionRows = await pool.query<{ readonly collection_id: string }>(
      `SELECT collection.collection_id
       FROM shop_collections AS collection
       INNER JOIN shop_item_collections AS membership
         ON membership.collection_id = collection.collection_id
       GROUP BY collection.collection_id`,
    );
    const activeCollectionIds = new Set(collectionRows.rows.map((row) => row.collection_id));
    for (const collectionId of [
      'first-position',
      'studio-essentials',
      'pointe-dreams',
      'blush-rehearsal',
      'satin-morning',
      'rose-academy',
      'pearl-barre',
      'moonlit-recital',
      'sunday-studio',
      'prima-evening',
      'petal-study',
    ]) {
      expect(activeCollectionIds.has(collectionId)).toBe(true);
    }

    const membershipRows = await pool.query<{
      readonly item_id: string;
      readonly collection_id: string;
    }>('SELECT item_id, collection_id FROM shop_item_collections');
    const memberships = new Set(
      membershipRows.rows.map((row) => `${row.item_id}:${row.collection_id}`),
    );
    expect(membershipRows.rows).toHaveLength(103);
    for (const item of catalog.rows) {
      expect(SHOP_CATEGORIES).toContain(item.category);
      expect(SHOP_RARITIES).toContain(item.rarity);
      expect(BigInt(item.price)).toBeGreaterThan(0n);
      if (item.collection !== null) {
        const collectionId = item.collection.toLowerCase().replaceAll(' ', '-');
        expect(memberships.has(`${item.item_id}:${collectionId}`)).toBe(true);
      }

      if (
        item.cosmetic_metadata !== null &&
        typeof item.cosmetic_metadata === 'object' &&
        !Array.isArray(item.cosmetic_metadata)
      ) {
        const slots = (item.cosmetic_metadata as Record<string, unknown>).slots;
        if (slots !== undefined) {
          expect(Array.isArray(slots)).toBe(true);
          for (const slot of slots as unknown[]) expect(WARDROBE_SLOTS).toContain(slot);
        }
      }
    }

    const discordUserId = testSnowflake();
    const economy = new EconomyService(pool);
    const shop = new ShopService(pool, economy);
    const marketplace = new MarketplaceService(pool, economy);
    const collections = new CollectionService(pool);
    await expect(shop.listItems()).resolves.toHaveLength(92);
    const beautyItems = await shop.listItems('beauty');
    expect(beautyItems).toHaveLength(2);
    expect(beautyItems.every((item) => item.purchasable)).toBe(true);
    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId,
      amount: 100n,
      reason: 'DAILY_REWARD',
    });
    await shop.purchase(testSnowflake(), discordUserId, 'satin-ribbon-bow', 1);

    const initial = await collections.listProgress(discordUserId);
    expect(initial).toContainEqual(
      expect.objectContaining({
        collectionId: 'first-position',
        ownedItems: 1,
        totalItems: 13,
        complete: false,
      }),
    );
    const listing = await marketplace.createListing(
      testSnowflake(),
      discordUserId,
      'satin-ribbon-bow',
      1,
      80n,
    );
    const escrowed = await collections.listProgress(discordUserId);
    expect(escrowed).toContainEqual(
      expect.objectContaining({ collectionId: 'first-position', ownedItems: 1, totalItems: 13 }),
    );
    await marketplace.cancel(testSnowflake(), discordUserId, listing.listing.listingId);
    await expect(collections.listProgress(discordUserId)).resolves.toContainEqual(
      expect.objectContaining({ collectionId: 'first-position', ownedItems: 1, totalItems: 13 }),
    );
  });

  it('unlocks activity, shop, and wardrobe achievements transactionally and features badges safely', async () => {
    const economy = new EconomyService(pool);
    const shop = new ShopService(pool, economy);
    const wardrobe = new WardrobeService(pool);
    const ballet = new BalletService(pool, economy);
    const achievements = new AchievementService(pool);
    const discordUserId = testSnowflake();
    await grantAcademyBasics(pool, discordUserId);
    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId,
      amount: 500n,
      reason: 'DAILY_REWARD',
    });
    await pool.query(
      `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
       VALUES ($1, 100, 2)`,
      [discordUserId],
    );
    await shop.purchase(testSnowflake(), discordUserId, 'satin-ribbon-bow', 1);
    await wardrobe.equip(discordUserId, 'satin-ribbon-bow');
    await ballet.practice(testSnowflake(), discordUserId, 'stretching');

    const unlocked = await pool.query<{ readonly achievement_id: string }>(
      `SELECT achievement_id FROM user_achievements
       WHERE discord_user_id = $1 ORDER BY achievement_id`,
      [discordUserId],
    );
    expect(unlocked.rows.map((row) => row.achievement_id)).toEqual([
      'first-boutique-piece',
      'first-steps',
      'first-studio-look',
    ]);
    await expect(achievements.list(discordUserId)).resolves.toContainEqual(
      expect.objectContaining({
        achievementId: 'first-steps',
        unlockedAt: expect.any(Date),
        featured: false,
      }),
    );

    const featureInteraction = testSnowflake();
    await expect(
      achievements.feature(featureInteraction, discordUserId, 'first-steps'),
    ).resolves.toMatchObject({
      replayed: false,
      achievement: { achievementId: 'first-steps', displayName: 'First Steps' },
    });
    await expect(
      achievements.feature(featureInteraction, discordUserId, 'first-steps'),
    ).resolves.toMatchObject({ replayed: true });
    await expect(achievements.getFeatured(discordUserId)).resolves.toMatchObject({
      achievementId: 'first-steps',
    });
    await expect(
      achievements.feature(testSnowflake(), discordUserId, 'first-performance'),
    ).rejects.toBeInstanceOf(AchievementNotUnlockedError);
    const clearInteraction = testSnowflake();
    await expect(
      achievements.clearFeatured(clearInteraction, discordUserId),
    ).resolves.toMatchObject({
      achievement: null,
      replayed: false,
    });
    await expect(
      achievements.clearFeatured(clearInteraction, discordUserId),
    ).resolves.toMatchObject({
      achievement: null,
      replayed: true,
    });
    await expect(achievements.getFeatured(discordUserId)).resolves.toBeNull();
  });

  it('awards market milestones once and recognizes completed collections in escrow-aware state', async () => {
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
      100n,
    );
    const purchaseId = testSnowflake();
    await market.buy(purchaseId, buyer, listing.listingId);
    await market.buy(purchaseId, buyer, listing.listingId);
    const marketAchievements = await pool.query<{
      readonly discord_user_id: string;
      readonly achievement_id: string;
    }>(
      `SELECT discord_user_id, achievement_id FROM user_achievements
       WHERE discord_user_id = ANY($1::text[])`,
      [[seller, buyer]],
    );
    expect(marketAchievements.rows).toHaveLength(3);
    expect(marketAchievements.rows).toEqual(
      expect.arrayContaining([
        { discord_user_id: buyer, achievement_id: 'first-market-purchase' },
        { discord_user_id: seller, achievement_id: 'first-boutique-piece' },
        { discord_user_id: seller, achievement_id: 'first-market-sale' },
      ]),
    );

    const curator = testSnowflake();
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [curator]);
    await pool.query(
      `INSERT INTO user_inventory (discord_user_id, item_id, quantity, source)
       SELECT $1, item_id, 1, 'ADMIN_GRANT' FROM shop_catalog`,
      [curator],
    );
    await Promise.all([
      withTransaction(pool, (client) =>
        evaluateCollectionAchievements(client, curator, 'collection-test-a'),
      ),
      withTransaction(pool, (client) =>
        evaluateCollectionAchievements(client, curator, 'collection-test-b'),
      ),
    ]);
    await expect(
      pool.query<{ readonly achievement_id: string; readonly total: number }>(
        `SELECT achievement_id, count(*)::integer AS total
         FROM user_achievements
         WHERE discord_user_id = $1
         GROUP BY achievement_id ORDER BY achievement_id`,
        [curator],
      ),
    ).resolves.toMatchObject({
      rows: [
        { achievement_id: 'first-collection', total: 1 },
        { achievement_id: 'three-collections', total: 1 },
      ],
    });

    const concurrentUser = testSnowflake();
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [concurrentUser]);
    await Promise.all([
      withTransaction(pool, (client) =>
        unlockAchievement(client, concurrentUser, 'first-steps', 'BALLET_ACTIVITY', 'practice-a'),
      ),
      withTransaction(pool, (client) =>
        unlockAchievement(client, concurrentUser, 'first-steps', 'BALLET_ACTIVITY', 'practice-b'),
      ),
    ]);
    await expect(
      pool.query(
        `SELECT achievement_id FROM user_achievements
         WHERE discord_user_id = $1 AND achievement_id = 'first-steps'`,
        [concurrentUser],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
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
    await grantAcademyBasics(pool, discordUserId);

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

  it('serializes concurrent replays of the same daily interaction', async () => {
    const economy = new EconomyService(pool);
    const daily = new DailyService(pool, economy);
    const discordUserId = testSnowflake();
    const interactionId = testSnowflake();

    const results = await Promise.all([
      daily.claimDaily(interactionId, discordUserId),
      daily.claimDaily(interactionId, discordUserId),
    ]);

    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    expect(results[0]?.balance).toBe(100n);
    expect(results[1]?.balance).toBe(100n);
    await expect(economy.getBalance(discordUserId)).resolves.toBe(100n);
    await expect(economy.getLedger(discordUserId)).resolves.toHaveLength(1);

    const claimCount = await pool.query<{ readonly count: string }>(
      'SELECT count(*) AS count FROM daily_claims WHERE discord_user_id = $1',
      [discordUserId],
    );
    expect(claimCount.rows[0]?.count).toBe('1');
  });

  it('persists Ballet XP and rewards, replays safely, and enforces unlocks and cooldowns', async () => {
    const economy = new EconomyService(pool);
    const ballet = new BalletService(pool, economy);
    const discordUserId = testSnowflake();
    const interactionId = testSnowflake();
    await grantAcademyBasics(pool, discordUserId);

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
    await grantAcademyBasics(pool, discordUserId);
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
    ).rejects.toMatchObject({ requirement: 'STATS' });

    await pool.query(
      `INSERT INTO ballet_stats (discord_user_id, stat_key)
       VALUES ($1, 'technique')
       ON CONFLICT (discord_user_id, stat_key) DO NOTHING`,
      [discordUserId],
    );
    await pool.query(
      `UPDATE ballet_stats SET stat_value = 9
       WHERE discord_user_id = $1 AND stat_key = 'technique'`,
      [discordUserId],
    );
    await expect(
      ballet.practice(testSnowflake(), discordUserId, 'pointe-practice'),
    ).rejects.toBeInstanceOf(AcademyUniformRequirementError);

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
    await wardrobe.equip(discordUserId, 'classic-ballet-flats');

    await expect(
      ballet.practice(testSnowflake(), discordUserId, 'choreography'),
    ).rejects.toBeInstanceOf(BalletActivityRequirementError);
    await ballet.practice(testSnowflake(), discordUserId, 'center-practice');
    const choreography = await ballet.practice(testSnowflake(), discordUserId, 'choreography');
    expect(choreography.stat).toEqual({ key: 'musicality', gain: 3, value: 5 });

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
    await grantAcademyBasics(pool, discordUserId);

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

  it('derives Academy standing from the existing Ballet records', async () => {
    const economy = new EconomyService(pool);
    const ballet = new BalletService(pool, economy);
    const academy = new BalletAcademyService(pool);
    const discordUserId = testSnowflake();
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [discordUserId]);
    await grantAcademyBasics(pool, discordUserId);
    await pool.query(
      `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
       VALUES ($1, 400, 5)`,
      [discordUserId],
    );
    await pool.query(
      `INSERT INTO ballet_stats (discord_user_id, stat_key, stat_value)
       VALUES ($1, 'technique', 6)`,
      [discordUserId],
    );

    for (const activity of ['class', 'barre', 'stretching', 'technique']) {
      await ballet.practice(testSnowflake(), discordUserId, activity);
    }

    await expect(academy.getProgress(discordUserId)).resolves.toMatchObject({
      currentRank: { id: 'apprentice', title: 'Academy Apprentice' },
      nextRank: { id: 'repertoire-artist' },
      completedRankCount: 1,
    });
  });

  it('requires equipped permanent Academy basics before a practice reward or cooldown is recorded', async () => {
    const discordUserId = testSnowflake();
    const economy = new EconomyService(pool);
    const ballet = new BalletService(pool, economy);
    const wardrobe = new WardrobeService(pool);
    const presets = new WardrobePresetService(pool);
    const academy = new BalletAcademyService(pool);
    await grantAcademyBasics(pool, discordUserId, false);

    const before = await academy.getUniformStatus(discordUserId);
    expect(before).toMatchObject({ ready: false, rank: { id: 'student' } });
    expect(before.pieces.filter((piece) => !piece.satisfied)).toHaveLength(3);
    await expect(
      ballet.practice(testSnowflake(), discordUserId, 'stretching'),
    ).rejects.toBeInstanceOf(AcademyUniformRequirementError);
    await expect(economy.getBalance(discordUserId)).resolves.toBe(0n);
    await expect(
      pool.query(
        'SELECT interaction_id FROM ballet_activity_completions WHERE discord_user_id = $1',
        [discordUserId],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });

    const claimInteractionId = testSnowflake();
    const claim = await academy.claimStarterUniform(claimInteractionId, discordUserId);
    expect(claim).toMatchObject({
      items: ['Sunday Cotton Leotard', 'Cream Studio Tights', 'Classic Ballet Flats'],
      replayed: false,
    });
    await expect(
      academy.claimStarterUniform(claimInteractionId, discordUserId),
    ).resolves.toMatchObject({
      items: claim.items,
      replayed: true,
    });
    await expect(
      academy.claimStarterUniform(testSnowflake(), discordUserId),
    ).rejects.toBeInstanceOf(AcademyUniformAlreadyClaimedError);
    await expect(economy.getBalance(discordUserId)).resolves.toBe(0n);
    const preset = await presets.createPreset(testSnowflake(), discordUserId, 'Academy basics');
    expect(await academy.getUniformStatus(discordUserId)).toMatchObject({
      ready: true,
      pointeRequired: false,
    });
    const result = await ballet.practice(testSnowflake(), discordUserId, 'stretching');
    expect(result).toMatchObject({ activityCode: 'stretching', slippersAwarded: 10n });

    await wardrobe.unequip(discordUserId, 'shoes');
    await wardrobe.unequip(discordUserId, 'tights');
    await wardrobe.unequip(discordUserId, 'leotard');
    expect(await academy.getUniformStatus(discordUserId)).toMatchObject({
      ready: false,
    });
    await presets.applyPreset(testSnowflake(), discordUserId, preset.presetId);
    const uniformAfterPreset = await academy.getUniformStatus(discordUserId);
    expect(uniformAfterPreset).toMatchObject({ ready: true });
    expect(uniformAfterPreset.look).toHaveLength(3);
    expect(uniformAfterPreset.look).toEqual(
      expect.arrayContaining([
        'Sunday Cotton Leotard',
        'Cream Studio Tights',
        'Classic Ballet Flats',
      ]),
    );
  });

  it('keeps every required beginner uniform role obtainable from permanent level-one catalog entries', async () => {
    const result = await pool.query<{
      readonly role: string;
      readonly available_count: number;
      readonly minimum_level: number;
    }>(
      `SELECT roles.role, count(*)::integer AS available_count,
              min(item.minimum_ballet_level)::integer AS minimum_level
       FROM shop_catalog AS item
       CROSS JOIN LATERAL jsonb_array_elements_text(
         item.cosmetic_metadata -> 'academy_uniform_roles'
       ) AS roles(role)
       WHERE item.active = true AND item.purchasable = true
         AND item.minimum_ballet_level <= 1
         AND roles.role = ANY($1::text[])
       GROUP BY roles.role`,
      [['academy-leotard', 'academy-tights', 'academy-flat']],
    );
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'academy-leotard', minimum_level: 1 }),
        expect.objectContaining({ role: 'academy-tights', minimum_level: 1 }),
        expect.objectContaining({ role: 'academy-flat', minimum_level: 1 }),
      ]),
    );
    expect(result.rows.every((row) => row.available_count > 0)).toBe(true);
  });

  it('rejects an ununiformed performance before recording its attempt or reward', async () => {
    const discordUserId = testSnowflake();
    const economy = new EconomyService(pool);
    const ballet = new BalletService(pool, economy);
    const performances = new PerformanceService(pool, economy);
    await grantAcademyBasics(pool, discordUserId);
    await pool.query(
      `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
       VALUES ($1, 900, 10)`,
      [discordUserId],
    );
    await pool.query(
      `INSERT INTO ballet_stats (discord_user_id, stat_key, stat_value) VALUES
        ($1, 'technique', 50), ($1, 'musicality', 70), ($1, 'performance', 80)`,
      [discordUserId],
    );
    for (const activity of ['class', 'rehearsal', 'performance']) {
      await ballet.practice(testSnowflake(), discordUserId, activity);
    }
    await new WardrobeService(pool).unequip(discordUserId, 'tights');
    const balanceBefore = await economy.getBalance(discordUserId);
    await expect(
      performances.perform(testSnowflake(), discordUserId, 'spring-recital'),
    ).rejects.toBeInstanceOf(AcademyUniformRequirementError);
    await expect(economy.getBalance(discordUserId)).resolves.toBe(balanceBefore);
    await expect(
      pool.query(
        'SELECT interaction_id FROM ballet_performance_completions WHERE discord_user_id = $1',
        [discordUserId],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it('records deterministic performances transactionally, replays safely, and enforces cooldowns', async () => {
    const economy = new EconomyService(pool);
    const ballet = new BalletService(pool, economy);
    const performances = new PerformanceService(pool, economy);
    const discordUserId = testSnowflake();
    const interactionId = testSnowflake();
    await grantAcademyBasics(pool, discordUserId);
    await pool.query(
      `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
       VALUES ($1, 900, 10)`,
      [discordUserId],
    );
    await pool.query(
      `INSERT INTO ballet_stats (discord_user_id, stat_key, stat_value) VALUES
        ($1, 'technique', 50), ($1, 'flexibility', 0), ($1, 'musicality', 70),
        ($1, 'performance', 80), ($1, 'pointe', 0), ($1, 'stamina', 0)`,
      [discordUserId],
    );

    await ballet.practice(testSnowflake(), discordUserId, 'class');
    await ballet.practice(testSnowflake(), discordUserId, 'rehearsal');
    await ballet.practice(testSnowflake(), discordUserId, 'performance');
    const balanceBefore = await economy.getBalance(discordUserId);
    const progressBefore = await ballet.getProgress(discordUserId);
    const triggerSuffix = randomUUID().replaceAll('-', '');
    const functionName = `noelia_test_reject_performance_${triggerSuffix}`;
    const triggerName = `noelia_test_performance_failure_${triggerSuffix}`;
    await pool.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected Ballet performance failure'; END;
      $$
    `);
    await pool.query(`
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON ballet_performance_completions
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()
    `);

    try {
      await expect(
        performances.perform(interactionId, discordUserId, 'spring-recital'),
      ).rejects.toThrow('injected Ballet performance failure');
    } finally {
      await pool.query(`DROP TRIGGER ${triggerName} ON ballet_performance_completions`);
      await pool.query(`DROP FUNCTION ${functionName}()`);
    }

    await expect(economy.getBalance(discordUserId)).resolves.toBe(balanceBefore);
    await expect(ballet.getProgress(discordUserId)).resolves.toMatchObject({
      totalXp: progressBefore.totalXp,
    });
    await expect(
      pool.query(
        'SELECT interaction_id FROM ballet_performance_completions WHERE interaction_id = $1',
        [interactionId],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
    await expect(
      pool.query('SELECT id FROM wallet_transactions WHERE idempotency_key = $1', [interactionId]),
    ).resolves.toMatchObject({ rowCount: 0 });

    const results = await Promise.all([
      performances.perform(interactionId, discordUserId, 'spring-recital'),
      performances.perform(interactionId, discordUserId, 'spring-recital'),
    ]);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    expect(results[0]).toMatchObject({ score: 72, tier: 'SILVER', slippersAwarded: 100n });
    await expect(new AchievementService(pool).list(discordUserId)).resolves.toContainEqual(
      expect.objectContaining({
        achievementId: 'first-performance',
        unlockedAt: expect.any(Date),
      }),
    );
    await expect(new AchievementService(pool).list(discordUserId)).resolves.toContainEqual(
      expect.objectContaining({ achievementId: 'first-recital', unlockedAt: expect.any(Date) }),
    );
    const history = await performances.listHistory(discordUserId, 1);
    expect(history).toMatchObject({ totalEntries: 1, entries: [{ score: 72, tier: 'SILVER' }] });
    await expect(economy.getBalance(discordUserId)).resolves.toBe(balanceBefore + 100n);
    await expect(
      performances.perform(testSnowflake(), discordUserId, 'spring-recital'),
    ).rejects.toBeInstanceOf(PerformanceCooldownError);
    await expect(performances.listPerformances(discordUserId)).resolves.toContainEqual(
      expect.objectContaining({ performanceId: 'spring-recital', availability: 'COOLDOWN' }),
    );

    const noviceId = testSnowflake();
    const novice = await performances.listPerformances(noviceId);
    expect(novice).toContainEqual(
      expect.objectContaining({ performanceId: 'spring-recital', lockReason: 'LEVEL' }),
    );
    await expect(
      performances.perform(testSnowflake(), noviceId, 'spring-recital'),
    ).rejects.toBeInstanceOf(PerformanceLockedError);

    const primaUserId = testSnowflake();
    await grantAcademyBasics(pool, primaUserId);
    await pool.query(
      `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
       VALUES ($1, 3400, 35)`,
      [primaUserId],
    );
    await pool.query(
      `INSERT INTO ballet_stats (discord_user_id, stat_key, stat_value) VALUES
        ($1, 'technique', 100), ($1, 'flexibility', 100), ($1, 'musicality', 100),
        ($1, 'performance', 100), ($1, 'pointe', 100), ($1, 'stamina', 100)`,
      [primaUserId],
    );
    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId: primaUserId,
      amount: 500n,
      reason: 'DAILY_REWARD',
    });
    const shop = new ShopService(pool, economy);
    const wardrobe = new WardrobeService(pool);
    for (const activity of ['class', 'rehearsal', 'performance', 'audition']) {
      await ballet.practice(testSnowflake(), primaUserId, activity);
    }
    await shop.purchase(testSnowflake(), primaUserId, 'pearl-pointe-shoes', 1);
    await wardrobe.equip(primaUserId, 'pearl-pointe-shoes');
    const primaResult = await performances.perform(testSnowflake(), primaUserId, 'prima-audition');
    expect(primaResult).toMatchObject({ score: 100, tier: 'PRIMA' });
    await expect(new AchievementService(pool).list(primaUserId)).resolves.toContainEqual(
      expect.objectContaining({ achievementId: 'prima-star', unlockedAt: expect.any(Date) }),
    );
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

  it('takes an expanded catalog item through purchase, inventory, wardrobe, profile, and marketplace', async () => {
    const discordUserId = testSnowflake();
    const economy = new EconomyService(pool);
    const shop = new ShopService(pool, economy);
    const wardrobe = new WardrobeService(pool);
    const ballet = new BalletService(pool, economy);
    const collections = new CollectionService(pool);
    const achievements = new AchievementService(pool);
    const relationships = new RelationshipService(pool);
    const academy = new BalletAcademyService(pool);
    const profile = new ProfileService(
      economy,
      ballet,
      wardrobe,
      collections,
      achievements,
      relationships,
      academy,
    );
    const marketplace = new MarketplaceService(pool, economy);
    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId,
      amount: 1_000n,
      reason: 'DAILY_REWARD',
    });
    await pool.query(
      `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
       VALUES ($1, 600, 3)`,
      [discordUserId],
    );

    const purchaseInteractionId = testSnowflake();
    const purchase = await shop.purchase(
      purchaseInteractionId,
      discordUserId,
      'first-class-leotard',
      1,
    );
    const replay = await shop.purchase(
      purchaseInteractionId,
      discordUserId,
      'first-class-leotard',
      1,
    );
    expect(purchase).toMatchObject({ totalPrice: 160n, inventoryQuantity: 1, walletBalance: 840n });
    expect(replay).toMatchObject({ replayed: true, walletBalance: 840n, inventoryQuantity: 1 });
    await expect(
      pool.query<{ readonly total: number }>(
        `SELECT count(*)::integer AS total FROM shop_purchases WHERE interaction_id = $1`,
        [purchaseInteractionId],
      ),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
    await expect(
      pool.query<{ readonly total: number }>(
        `SELECT count(*)::integer AS total
         FROM wallet_ledger AS ledger
         INNER JOIN wallet_transactions AS wallet_tx
           ON wallet_tx.id = ledger.transaction_id
         WHERE wallet_tx.idempotency_key = $1`,
        [purchaseInteractionId],
      ),
    ).resolves.toMatchObject({ rows: [{ total: 1 }] });
    await expect(wardrobe.equip(discordUserId, 'first-class-leotard')).resolves.toMatchObject({
      itemId: 'first-class-leotard',
      slots: ['leotard'],
    });
    await expect(profile.getProfile(discordUserId)).resolves.toMatchObject({
      balletSlippers: 840n,
      outfit: [expect.objectContaining({ itemId: 'first-class-leotard', slots: ['leotard'] })],
      academyUniform: { ready: false, look: ['First Class Leotard'] },
      totalCollections: 11,
    });

    await shop.purchase(testSnowflake(), discordUserId, 'sunday-studio-tote', 1);
    const { listing } = await marketplace.createListing(
      testSnowflake(),
      discordUserId,
      'sunday-studio-tote',
      1,
      350n,
    );
    await expect(marketplace.browse(1)).resolves.toMatchObject({
      listings: [
        expect.objectContaining({
          listingId: listing.listingId,
          itemId: 'sunday-studio-tote',
          displayName: 'Sunday Studio Tote',
          category: 'bag',
          rarity: 'uncommon',
        }),
      ],
    });
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

  it('saves, replays, applies, and removes wardrobe presets without bypassing marketplace escrow', async () => {
    const economy = new EconomyService(pool);
    const shop = new ShopService(pool, economy);
    const wardrobe = new WardrobeService(pool);
    const presets = new WardrobePresetService(pool);
    const market = new MarketplaceService(pool, economy);
    const discordUserId = testSnowflake();
    await economy.credit({
      interactionId: testSnowflake(),
      discordUserId,
      amount: 500n,
      reason: 'DAILY_REWARD',
    });
    await pool.query(
      `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
       VALUES ($1, 100, 2)`,
      [discordUserId],
    );
    await shop.purchase(testSnowflake(), discordUserId, 'satin-ribbon-bow', 1);
    await shop.purchase(testSnowflake(), discordUserId, 'petal-practice-leotard', 1);
    await wardrobe.equip(discordUserId, 'satin-ribbon-bow');

    const createId = testSnowflake();
    const created = await presets.createPreset(createId, discordUserId, 'Training');
    const replayedCreate = await presets.createPreset(createId, discordUserId, 'Training');
    expect(created).toMatchObject({ replayed: false, name: 'Training', itemCount: 1 });
    expect(replayedCreate).toMatchObject({ ...created, replayed: true });
    await expect(
      presets.createPreset(testSnowflake(), discordUserId, ' training '),
    ).rejects.toBeInstanceOf(WardrobePresetNameTakenError);

    await wardrobe.equip(discordUserId, 'petal-practice-leotard');
    const saveId = testSnowflake();
    await expect(
      presets.savePreset(saveId, discordUserId, created.presetId),
    ).resolves.toMatchObject({
      replayed: false,
      itemCount: 2,
    });
    await expect(
      presets.savePreset(saveId, discordUserId, created.presetId),
    ).resolves.toMatchObject({
      replayed: true,
      itemCount: 2,
    });

    const clearId = testSnowflake();
    await expect(presets.clear(clearId, discordUserId)).resolves.toEqual({
      removedItemCount: 2,
      replayed: false,
    });
    await expect(presets.clear(clearId, discordUserId)).resolves.toEqual({
      removedItemCount: 2,
      replayed: true,
    });

    const applyId = testSnowflake();
    const applied = await presets.applyPreset(applyId, discordUserId, created.presetId);
    expect(applied).toMatchObject({
      replayed: false,
      outfit: expect.arrayContaining([
        expect.objectContaining({ itemId: 'satin-ribbon-bow' }),
        expect.objectContaining({ itemId: 'petal-practice-leotard' }),
      ]),
    });
    await expect(
      presets.applyPreset(applyId, discordUserId, created.presetId),
    ).resolves.toMatchObject({
      replayed: true,
      outfit: applied.outfit,
    });

    await presets.clear(testSnowflake(), discordUserId);
    const { listing } = await market.createListing(
      testSnowflake(),
      discordUserId,
      'satin-ribbon-bow',
      1,
      100n,
    );
    await expect(
      presets.applyPreset(testSnowflake(), discordUserId, created.presetId),
    ).rejects.toBeInstanceOf(WardrobePresetItemsUnavailableError);
    await expect(wardrobe.getOutfit(discordUserId)).resolves.toEqual([]);
    await market.cancel(testSnowflake(), discordUserId, listing.listingId);

    await expect(
      presets.applyPreset(testSnowflake(), discordUserId, created.presetId),
    ).resolves.toMatchObject({
      outfit: expect.arrayContaining([
        expect.objectContaining({ itemId: 'satin-ribbon-bow' }),
        expect.objectContaining({ itemId: 'petal-practice-leotard' }),
      ]),
    });
    const renamed = await presets.renamePreset(
      testSnowflake(),
      discordUserId,
      created.presetId,
      'Recital Look',
    );
    expect(renamed).toMatchObject({ name: 'Recital Look', itemCount: 2 });
    await expect(presets.listPresets(discordUserId)).resolves.toContainEqual(
      expect.objectContaining({ presetId: created.presetId, name: 'Recital Look', itemCount: 2 }),
    );
    await expect(
      presets.deletePreset(testSnowflake(), discordUserId, created.presetId),
    ).resolves.toMatchObject({ name: 'Recital Look', itemCount: 2, replayed: false });
    await expect(presets.listPresets(discordUserId)).resolves.toEqual([]);
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
    await expect(market.listMine(seller, 1)).resolves.toMatchObject({
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

  it('serializes concurrent marriage accepts and makes duplicate decisions and divorce idempotent', async () => {
    const relationships = new RelationshipService(pool);
    const guildId = testSnowflake();
    const proposer = testSnowflake();
    const target = testSnowflake();
    const proposal = await relationships.propose(testSnowflake(), guildId, proposer, target);
    const acceptIds = [testSnowflake(), testSnowflake()] as const;

    const decisions = await Promise.allSettled([
      relationships.respond(acceptIds[0], guildId, target, proposal.proposal.proposalId, 'ACCEPT'),
      relationships.respond(acceptIds[1], guildId, target, proposal.proposal.proposalId, 'ACCEPT'),
    ]);
    const acceptedIndex = decisions.findIndex((decision) => decision.status === 'fulfilled');
    const rejected = decisions.find((decision) => decision.status === 'rejected');
    expect(acceptedIndex).toBeGreaterThanOrEqual(0);
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(MarriageProposalUnavailableError);
    }
    const acceptedRequestId = acceptIds[acceptedIndex];
    expect(acceptedRequestId).toBeDefined();
    const replay = await relationships.respond(
      acceptedRequestId!,
      guildId,
      target,
      proposal.proposal.proposalId,
      'ACCEPT',
    );
    expect(replay).toMatchObject({ status: 'ACCEPTED', replayed: true });

    const proposerMarriage = await relationships.getMarriage(proposer);
    const targetMarriage = await relationships.getMarriage(target);
    expect(proposerMarriage).toMatchObject({ partnerUserId: target });
    expect(targetMarriage).toMatchObject({
      relationshipId: proposerMarriage?.relationshipId,
      partnerUserId: proposer,
    });
    await expect(
      relationships.propose(testSnowflake(), guildId, proposer, testSnowflake()),
    ).rejects.toBeInstanceOf(MarriageParticipantUnavailableError);

    const divorceId = testSnowflake();
    const divorce = await relationships.divorce(divorceId, target);
    expect(divorce.replayed).toBe(false);
    await expect(relationships.getMarriage(proposer)).resolves.toBeNull();
    await expect(relationships.getMarriage(target)).resolves.toBeNull();
    await expect(relationships.divorce(divorceId, target)).resolves.toEqual({
      relationshipId: divorce.relationshipId,
      replayed: true,
    });
  });

  it('prevents overlapping proposals and enforces target-only decisions and proposer-only cancellation', async () => {
    const relationships = new RelationshipService(pool);
    const guildId = testSnowflake();
    const proposer = testSnowflake();
    const firstTarget = testSnowflake();
    const secondTarget = testSnowflake();
    const proposalIds = [testSnowflake(), testSnowflake()] as const;
    const proposals = await Promise.allSettled([
      relationships.propose(proposalIds[0], guildId, proposer, firstTarget),
      relationships.propose(proposalIds[1], guildId, proposer, secondTarget),
    ]);
    expect(proposals.filter((proposal) => proposal.status === 'fulfilled')).toHaveLength(1);
    const rejected = proposals.find((proposal) => proposal.status === 'rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(MarriageParticipantUnavailableError);
    }
    const activeIndex = proposals.findIndex((proposal) => proposal.status === 'fulfilled');
    const active = proposals[activeIndex];
    expect(active?.status).toBe('fulfilled');
    if (active?.status !== 'fulfilled') throw new Error('Expected one proposal to be created.');

    await expect(
      relationships.respond(
        testSnowflake(),
        guildId,
        testSnowflake(),
        active.value.proposal.proposalId,
        'ACCEPT',
      ),
    ).rejects.toBeInstanceOf(MarriageProposalActorError);
    const targetUserId = active.value.proposal.targetUserId;
    await expect(
      relationships.cancel(
        testSnowflake(),
        guildId,
        targetUserId,
        active.value.proposal.proposalId,
      ),
    ).rejects.toBeInstanceOf(MarriageProposalActorError);
    await expect(
      relationships.cancel(testSnowflake(), guildId, proposer, active.value.proposal.proposalId),
    ).resolves.toMatchObject({ status: 'CANCELLED', replayed: false });

    const afterCancel = await relationships.propose(
      testSnowflake(),
      guildId,
      proposer,
      testSnowflake(),
    );
    const declined = await relationships.respond(
      testSnowflake(),
      guildId,
      afterCancel.proposal.targetUserId,
      afterCancel.proposal.proposalId,
      'DECLINE',
    );
    expect(declined).toMatchObject({ status: 'DECLINED', relationshipId: null, replayed: false });
    await expect(relationships.getMarriage(proposer)).resolves.toBeNull();
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
