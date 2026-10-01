import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { GAMEPLAY_CONFIG } from '../../src/config/gameplay.js';
import { DailyService } from '../../src/economy/daily-service.js';
import { DailyCooldownError } from '../../src/economy/daily-errors.js';
import { IdempotencyConflictError } from '../../src/economy/errors.js';
import type { WalletMutationResult } from '../../src/economy/types.js';

const discordUserId = '222222222222222222';
const interactionId = '111111111111111111';

interface DailyClaimRow {
  readonly discord_user_id: string;
  readonly reward_amount: string;
  readonly request_fingerprint: string;
  readonly claimed_at: Date;
  readonly next_claim_at: Date;
  readonly balance_after: string;
}

function requestFingerprint(userId: string): string {
  return createHash('sha256').update(`${userId}\u0000DAILY_REWARD`).digest('hex');
}

function createDailyService(options?: {
  readonly currentTime?: Date;
  readonly latestClaim?: { readonly claimedAt: Date; readonly nextClaimAt: Date };
  readonly existingClaim?: DailyClaimRow;
  readonly walletResult?: WalletMutationResult;
  readonly walletError?: Error;
}) {
  const currentTime = options?.currentTime ?? new Date('2026-10-01T12:00:00.000Z');
  const statements: string[] = [];
  const query = vi.fn(async (rawSql: string) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    statements.push(sql);

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }
    if (
      sql.startsWith('INSERT INTO discord_users') ||
      sql.startsWith('SELECT discord_user_id FROM discord_users')
    ) {
      return { rows: [{ discord_user_id: discordUserId }] };
    }
    if (sql.startsWith('SELECT daily.discord_user_id')) {
      return { rows: options?.existingClaim === undefined ? [] : [options.existingClaim] };
    }
    if (sql.startsWith('SELECT claimed_at, next_claim_at')) {
      const latest = options?.latestClaim;
      return {
        rows:
          latest === undefined
            ? []
            : [{ claimed_at: latest.claimedAt, next_claim_at: latest.nextClaimAt }],
      };
    }
    if (sql === 'SELECT clock_timestamp() AS current_time') {
      return { rows: [{ current_time: currentTime }] };
    }
    if (sql.startsWith('INSERT INTO daily_claims')) {
      return {
        rows: [
          {
            claimed_at: currentTime,
            next_claim_at: new Date(currentTime.getTime() + GAMEPLAY_CONFIG.dailyCooldownMs),
          },
        ],
      };
    }

    throw new Error(`Unexpected test SQL: ${sql}`);
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  const creditWithinTransaction = vi.fn().mockImplementation(async () => {
    if (options?.walletError !== undefined) {
      throw options.walletError;
    }
    return (
      options?.walletResult ?? {
        balance: 375n,
        transactionId: '5001',
        replayed: false,
      }
    );
  });
  const service = new DailyService(pool, { creditWithinTransaction });

  return { service, client, creditWithinTransaction, statements, query };
}

describe('DailyService', () => {
  it('credits the configured reward and records its rolling 24-hour expiry in one transaction', async () => {
    const database = createDailyService();
    const currentTime = new Date('2026-10-01T12:00:00.000Z');

    await expect(database.service.claimDaily(interactionId, discordUserId)).resolves.toEqual({
      rewardAmount: 100n,
      balance: 375n,
      claimedAt: currentTime,
      nextClaimAt: new Date(currentTime.getTime() + 24 * 60 * 60 * 1_000),
      replayed: false,
    });
    expect(database.creditWithinTransaction).toHaveBeenCalledWith(database.client, {
      interactionId,
      discordUserId,
      amount: GAMEPLAY_CONFIG.dailyRewardAmount,
      reason: 'DAILY_REWARD',
    });
    expect(database.statements).toContain('BEGIN');
    expect(database.statements).toContain('COMMIT');
  });

  it('allows a claim exactly at the cooldown boundary', async () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    const database = createDailyService({
      currentTime: now,
      latestClaim: {
        claimedAt: new Date(now.getTime() - GAMEPLAY_CONFIG.dailyCooldownMs),
        nextClaimAt: now,
      },
    });

    await expect(database.service.claimDaily(interactionId, discordUserId)).resolves.toMatchObject({
      replayed: false,
    });
    expect(database.creditWithinTransaction).toHaveBeenCalledOnce();
  });

  it('rejects a claim before the rolling cooldown ends without crediting or inserting a claim', async () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    const nextClaimAt = new Date(now.getTime() + 60_000);
    const database = createDailyService({
      currentTime: now,
      latestClaim: {
        claimedAt: new Date(now.getTime() - GAMEPLAY_CONFIG.dailyCooldownMs + 60_000),
        nextClaimAt,
      },
    });

    await expect(database.service.claimDaily(interactionId, discordUserId)).rejects.toMatchObject({
      name: DailyCooldownError.name,
      nextClaimAt,
    });
    expect(database.creditWithinTransaction).not.toHaveBeenCalled();
    expect(database.statements).toContain('ROLLBACK');
    expect(database.statements.some((sql) => sql.startsWith('INSERT INTO daily_claims'))).toBe(
      false,
    );
  });

  it('replays a completed interaction before applying the cooldown check', async () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    const claimedAt = new Date(now.getTime() - 1_000);
    const nextClaimAt = new Date(claimedAt.getTime() + GAMEPLAY_CONFIG.dailyCooldownMs);
    const database = createDailyService({
      currentTime: now,
      existingClaim: {
        discord_user_id: discordUserId,
        reward_amount: '100',
        request_fingerprint: requestFingerprint(discordUserId),
        claimed_at: claimedAt,
        next_claim_at: nextClaimAt,
        balance_after: '475',
      },
    });

    await expect(database.service.claimDaily(interactionId, discordUserId)).resolves.toEqual({
      rewardAmount: 100n,
      balance: 475n,
      claimedAt,
      nextClaimAt,
      replayed: true,
    });
    expect(database.creditWithinTransaction).not.toHaveBeenCalled();
    expect(
      database.statements.some((sql) => sql.startsWith('SELECT claimed_at, next_claim_at')),
    ).toBe(false);
  });

  it('rejects reuse of an interaction by a different user', async () => {
    const database = createDailyService({
      existingClaim: {
        discord_user_id: '333333333333333333',
        reward_amount: '100',
        request_fingerprint: requestFingerprint('333333333333333333'),
        claimed_at: new Date('2026-10-01T11:00:00.000Z'),
        next_claim_at: new Date('2026-10-02T11:00:00.000Z'),
        balance_after: '100',
      },
    });

    await expect(database.service.claimDaily(interactionId, discordUserId)).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
    expect(database.creditWithinTransaction).not.toHaveBeenCalled();
    expect(database.statements).toContain('ROLLBACK');
  });

  it('does not record a daily claim if the wallet reward fails', async () => {
    const failure = new Error('wallet persistence failed');
    const database = createDailyService({ walletError: failure });

    await expect(database.service.claimDaily(interactionId, discordUserId)).rejects.toBe(failure);
    expect(database.statements.some((sql) => sql.startsWith('INSERT INTO daily_claims'))).toBe(
      false,
    );
    expect(database.statements).toContain('ROLLBACK');
  });
});
