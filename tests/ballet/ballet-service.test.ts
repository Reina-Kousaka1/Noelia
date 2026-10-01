import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { BalletService } from '../../src/ballet/ballet-service.js';
import {
  BalletActivityLockedError,
  BalletCooldownError,
  UnknownBalletActivityError,
} from '../../src/ballet/errors.js';
import type { BalletActivityCode } from '../../src/ballet/activity-codes.js';
import type { BalletPracticeResult } from '../../src/ballet/types.js';
import type { WalletMutationResult } from '../../src/economy/types.js';

const discordUserId = '222222222222222222';
const interactionId = '111111111111111111';
const now = new Date('2026-10-01T12:00:00.000Z');

interface ProgressFixture {
  readonly totalXp: bigint;
  readonly level: number;
}

interface ActivityFixture {
  readonly activity_code: string;
  readonly display_name: string;
  readonly minimum_level: number;
  readonly xp_reward: string;
  readonly slippers_reward: string;
  readonly cooldown_ms: string;
}

interface CompletionFixture {
  readonly discord_user_id: string;
  readonly activity_code: string;
  readonly display_name: string;
  readonly request_fingerprint: string;
  readonly xp_awarded: string;
  readonly slippers_awarded: string;
  readonly total_xp_after: string;
  readonly level_after: number;
  readonly completed_at: Date;
  readonly next_available_at: Date;
  readonly wallet_balance_after: string;
}

function fingerprint(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}\u0000BALLET_ACTIVITY\u0000${code}`).digest('hex');
}

function createBalletService(options?: {
  readonly progress?: ProgressFixture;
  readonly activity?: ActivityFixture;
  readonly activities?: readonly ActivityFixture[];
  readonly latestNextAvailableAt?: Date;
  readonly existingCompletion?: CompletionFixture;
  readonly walletMutation?: WalletMutationResult;
}) {
  const progress = options?.progress ?? { totalXp: 90n, level: 1 };
  const activity = options?.activity ?? {
    activity_code: 'stretching',
    display_name: 'Stretching',
    minimum_level: 1,
    xp_reward: '15',
    slippers_reward: '20',
    cooldown_ms: '1800000',
  };
  const activities = options?.activities ?? [activity];
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
    if (sql.startsWith('SELECT discord_user_id FROM discord_users')) {
      return { rows: [{ discord_user_id: discordUserId }] };
    }
    if (sql.startsWith('INSERT INTO ballet_progress')) {
      return { rows: [] };
    }
    if (sql.startsWith('SELECT total_xp, level FROM ballet_progress')) {
      return { rows: [{ total_xp: progress.totalXp.toString(), level: progress.level }] };
    }
    if (sql.startsWith('SELECT completion.discord_user_id')) {
      return {
        rows: options?.existingCompletion === undefined ? [] : [options.existingCompletion],
      };
    }
    if (sql.startsWith('SELECT activity_code, display_name, minimum_level')) {
      const selected = activities.find((item) => item.activity_code === String(values[0]));
      return { rows: selected === undefined ? [] : [selected] };
    }
    if (sql.startsWith('SELECT next_available_at FROM ballet_activity_completions')) {
      return {
        rows:
          options?.latestNextAvailableAt === undefined
            ? []
            : [{ next_available_at: options.latestNextAvailableAt }],
      };
    }
    if (sql === 'SELECT clock_timestamp() AS current_time') {
      return { rows: [{ current_time: now }] };
    }
    if (sql.startsWith('SELECT total_xp, level FROM ballet_progress WHERE')) {
      return { rows: [{ total_xp: progress.totalXp.toString(), level: progress.level }] };
    }
    if (sql.startsWith('SELECT activity.activity_code')) {
      return {
        rows: activities.map((item) => ({
          ...item,
          current_level: progress.level,
          current_time: now,
          next_available_at: options?.latestNextAvailableAt ?? null,
        })),
      };
    }
    if (sql.startsWith('UPDATE ballet_progress')) {
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO ballet_activity_completions')) {
      return {
        rows: [
          {
            completed_at: values[9],
            next_available_at: values[10],
          },
        ],
      };
    }

    throw new Error(`Unexpected test SQL: ${sql}`);
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = {
    query,
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  const creditWithinTransaction = vi.fn().mockResolvedValue(
    options?.walletMutation ?? {
      balance: 220n,
      transactionId: '5001',
      replayed: false,
    },
  );
  const service = new BalletService(pool, { creditWithinTransaction });

  return { service, client, creditWithinTransaction, statements, query };
}

describe('BalletService', () => {
  it('awards configured XP and Ballet Slippers and records cooldown progress atomically', async () => {
    const database = createBalletService();

    await expect(
      database.service.practice(interactionId, discordUserId, 'stretching'),
    ).resolves.toMatchObject({
      activityCode: 'stretching',
      displayName: 'Stretching',
      xpAwarded: 15n,
      slippersAwarded: 20n,
      totalXp: 105n,
      level: 2,
      nextLevelXp: 95n,
      walletBalance: 220n,
      replayed: false,
    } satisfies Partial<BalletPracticeResult>);

    expect(database.creditWithinTransaction).toHaveBeenCalledWith(database.client, {
      interactionId,
      discordUserId,
      amount: 20n,
      reason: 'BALLET_ACTIVITY',
    });
    expect(database.statements).toContain('BEGIN');
    expect(database.statements).toContain('COMMIT');
  });

  it('replays the same interaction without awarding XP or currency twice', async () => {
    const existingCompletion: CompletionFixture = {
      discord_user_id: discordUserId,
      activity_code: 'stretching',
      display_name: 'Stretching',
      request_fingerprint: fingerprint(discordUserId, 'stretching'),
      xp_awarded: '15',
      slippers_awarded: '20',
      total_xp_after: '105',
      level_after: 2,
      completed_at: now,
      next_available_at: new Date(now.getTime() + 1_800_000),
      wallet_balance_after: '220',
    };
    const database = createBalletService({ existingCompletion });

    await expect(
      database.service.practice(interactionId, discordUserId, 'stretching'),
    ).resolves.toMatchObject({
      displayName: 'Stretching',
      totalXp: 105n,
      walletBalance: 220n,
      replayed: true,
    });
    expect(database.creditWithinTransaction).not.toHaveBeenCalled();
  });

  it('enforces the per-activity cooldown without issuing another reward', async () => {
    const nextAvailableAt = new Date(now.getTime() + 60_000);
    const database = createBalletService({ latestNextAvailableAt: nextAvailableAt });

    await expect(
      database.service.practice(interactionId, discordUserId, 'stretching'),
    ).rejects.toBeInstanceOf(BalletCooldownError);
    expect(database.creditWithinTransaction).not.toHaveBeenCalled();
    expect(database.statements).toContain('ROLLBACK');
  });

  it('enforces level unlocks and rejects unknown activities', async () => {
    const lockedActivity: ActivityFixture = {
      activity_code: 'center-practice',
      display_name: 'Center Practice',
      minimum_level: 2,
      xp_reward: '25',
      slippers_reward: '30',
      cooldown_ms: '7200000',
    };
    const locked = createBalletService({
      progress: { totalXp: 0n, level: 1 },
      activity: lockedActivity,
    });
    await expect(
      locked.service.practice(interactionId, discordUserId, 'center-practice'),
    ).rejects.toBeInstanceOf(BalletActivityLockedError);
    expect(locked.creditWithinTransaction).not.toHaveBeenCalled();

    const unknown = createBalletService();
    await expect(
      unknown.service.practice(interactionId, discordUserId, 'unlisted-activity'),
    ).rejects.toBeInstanceOf(UnknownBalletActivityError);
    expect(unknown.creditWithinTransaction).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused for a different practice', async () => {
    const existingCompletion: CompletionFixture = {
      discord_user_id: discordUserId,
      activity_code: 'barre',
      display_name: 'Barre',
      request_fingerprint: fingerprint(discordUserId, 'barre'),
      xp_awarded: '10',
      slippers_awarded: '15',
      total_xp_after: '100',
      level_after: 2,
      completed_at: now,
      next_available_at: new Date(now.getTime() + 1_800_000),
      wallet_balance_after: '200',
    };
    const database = createBalletService({ existingCompletion });

    await expect(
      database.service.practice(interactionId, discordUserId, 'stretching'),
    ).rejects.toThrow(
      'This Discord interaction has already been used for a different wallet change.',
    );
    expect(database.creditWithinTransaction).not.toHaveBeenCalled();
  });

  it('lists level-gated activities and returns an empty profile at level one', async () => {
    const centerPractice: ActivityFixture = {
      activity_code: 'center-practice',
      display_name: 'Center Practice',
      minimum_level: 2,
      xp_reward: '25',
      slippers_reward: '30',
      cooldown_ms: '7200000',
    };
    const database = createBalletService({
      progress: { totalXp: 0n, level: 1 },
      activity: centerPractice,
      activities: [centerPractice],
    });

    await expect(database.service.getProgress(discordUserId)).resolves.toMatchObject({
      totalXp: 0n,
      level: 1,
      xpToNextLevel: 100n,
    });
    await expect(database.service.listActivities(discordUserId)).resolves.toMatchObject([
      {
        code: 'center-practice' satisfies BalletActivityCode,
        availability: 'LOCKED',
        minimumLevel: 2,
      },
    ]);
  });
});
