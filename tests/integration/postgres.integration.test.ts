import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BalletService } from '../../src/ballet/ballet-service.js';
import { BalletActivityLockedError, BalletCooldownError } from '../../src/ballet/errors.js';
import { PostgresDiscordUserRepository } from '../../src/database/discord-user.repository.js';
import { runMigrations } from '../../src/database/migrations/runner.js';
import { withClientTransaction } from '../../src/database/transaction.js';
import { EconomyService } from '../../src/economy/economy-service.js';
import { DailyCooldownError } from '../../src/economy/daily-errors.js';
import { DailyService } from '../../src/economy/daily-service.js';
import { InsufficientBalletSlippersError } from '../../src/economy/errors.js';
import { createIsolatedTestPool } from '../support/test-database.js';
import { ShopItemAlreadyOwnedError } from '../../src/shop/errors.js';
import { ShopService } from '../../src/shop/shop-service.js';

const integrationDescribe = process.env.NOELIA_TEST_DATABASE_URL ? describe : describe.skip;

function testSnowflake(): string {
  const randomHex = randomUUID().replaceAll('-', '').slice(0, 15);
  return (BigInt(`0x${randomHex}`) + 1_000_000_000_000_000_000n).toString();
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

  it('applies migrations idempotently and persists Discord user identity', async () => {
    const migrationResult = await runMigrations(pool);
    const repository = new PostgresDiscordUserRepository(pool);
    const discordUserId = '987654321098765432';
    const first = await repository.findOrCreate(discordUserId);
    const second = await repository.findOrCreate(discordUserId);

    expect(migrationResult).toEqual({ appliedCount: 0, currentVersion: 5 });
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
    expect(replay.replayed).toBe(true);
    await expect(
      ballet.practice(testSnowflake(), discordUserId, 'stretching'),
    ).rejects.toBeInstanceOf(BalletCooldownError);
    await expect(
      ballet.practice(testSnowflake(), discordUserId, 'center-practice'),
    ).rejects.toBeInstanceOf(BalletActivityLockedError);
    await expect(ballet.getProgress(discordUserId)).resolves.toMatchObject({
      totalXp: 8n,
      level: 1,
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
});
