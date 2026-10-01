import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import { withTransaction } from '../database/transaction.js';
import { IdempotencyConflictError } from '../economy/errors.js';
import type { WalletCreditTransactionPort } from '../economy/ports.js';
import type { BalletActivityCode } from './activity-codes.js';
import {
  BalletActivityLockedError,
  BalletCooldownError,
  BalletXpLimitError,
  UnknownBalletActivityError,
} from './errors.js';
import { getBalletLevel, getXpToNextLevel, MAX_BALLET_LEVEL } from './progression.js';
import type {
  BalletActivityView,
  BalletPracticeResult,
  BalletProgressPort,
  BalletProgressStatus,
} from './types.js';
import { BALLET_ACTIVITY_CODES } from './activity-codes.js';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

interface ProgressRow extends QueryResultRow {
  readonly total_xp: string;
  readonly level: number;
}

interface UserRow extends QueryResultRow {
  readonly discord_user_id: string;
}

interface ActivityRow extends QueryResultRow {
  readonly activity_code: string;
  readonly display_name: string;
  readonly minimum_level: number;
  readonly xp_reward: string;
  readonly slippers_reward: string;
  readonly cooldown_ms: string;
}

interface ActivityListRow extends ActivityRow {
  readonly current_level: number;
  readonly current_time: Date;
  readonly next_available_at: Date | null;
}

interface LatestCompletionRow extends QueryResultRow {
  readonly next_available_at: Date;
}

interface ExistingCompletionRow extends QueryResultRow {
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

interface CurrentTimeRow extends QueryResultRow {
  readonly current_time: Date;
}

interface InsertedCompletionRow extends QueryResultRow {
  readonly completed_at: Date;
  readonly next_available_at: Date;
}

export class BalletService implements BalletProgressPort {
  public constructor(
    private readonly pool: Pool,
    private readonly wallet: WalletCreditTransactionPort,
  ) {}

  public async getProgress(discordUserId: string): Promise<BalletProgressStatus> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<ProgressRow>(
      `SELECT total_xp, level
       FROM ballet_progress
       WHERE discord_user_id = $1`,
      [discordUserId],
    );
    const row = result.rows[0];
    const totalXp = row === undefined ? 0n : BigInt(row.total_xp);
    const level = row === undefined ? 1 : Math.min(row.level, MAX_BALLET_LEVEL);

    return {
      totalXp,
      level,
      xpToNextLevel: getXpToNextLevel(totalXp),
    };
  }

  public async listActivities(discordUserId: string): Promise<readonly BalletActivityView[]> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<ActivityListRow>(
      `SELECT activity.activity_code,
              activity.display_name,
              activity.minimum_level,
              activity.xp_reward,
              activity.slippers_reward,
              activity.cooldown_ms,
              COALESCE(progress.level, 1) AS current_level,
              clock_timestamp() AS current_time,
              latest.next_available_at
       FROM ballet_activity_catalog AS activity
       LEFT JOIN ballet_progress AS progress
         ON progress.discord_user_id = $1
       LEFT JOIN LATERAL (
         SELECT completion.next_available_at
         FROM ballet_activity_completions AS completion
         WHERE completion.discord_user_id = $1
           AND completion.activity_code = activity.activity_code
         ORDER BY completion.completed_at DESC, completion.interaction_id DESC
         LIMIT 1
       ) AS latest ON true
       WHERE activity.active = true
       ORDER BY activity.minimum_level, activity.display_name`,
      [discordUserId],
    );

    return result.rows.map((row) => {
      const nextAvailableAt = row.next_available_at;
      const availability =
        row.current_level < row.minimum_level
          ? 'LOCKED'
          : nextAvailableAt !== null && row.current_time.getTime() < nextAvailableAt.getTime()
            ? 'COOLDOWN'
            : 'AVAILABLE';

      return {
        code: this.parseActivityCode(row.activity_code),
        displayName: row.display_name,
        minimumLevel: row.minimum_level,
        xpReward: BigInt(row.xp_reward),
        slippersReward: BigInt(row.slippers_reward),
        availability,
        nextAvailableAt,
      };
    });
  }

  public async practice(
    interactionId: string,
    discordUserId: string,
    activityCode: string,
  ): Promise<BalletPracticeResult> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    const requestFingerprint = createHash('sha256')
      .update(`${discordUserId}\u0000BALLET_ACTIVITY\u0000${activityCode}`)
      .digest('hex');

    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUser(client, discordUserId);
      await client.query(
        `INSERT INTO ballet_progress (discord_user_id)
         VALUES ($1)
         ON CONFLICT (discord_user_id) DO NOTHING`,
        [discordUserId],
      );
      const progressResult = await client.query<ProgressRow>(
        `SELECT total_xp, level
         FROM ballet_progress
         WHERE discord_user_id = $1
         FOR UPDATE`,
        [discordUserId],
      );
      const progress = progressResult.rows[0];

      if (progress === undefined) {
        throw new Error('Ballet progress row could not be locked after insert.');
      }

      const totalXp = BigInt(progress.total_xp);
      const level = Math.min(progress.level, MAX_BALLET_LEVEL);
      const existingCompletion = await this.findCompletion(client, interactionId);

      if (existingCompletion !== undefined) {
        if (
          existingCompletion.discord_user_id !== discordUserId ||
          existingCompletion.activity_code !== activityCode ||
          existingCompletion.request_fingerprint !== requestFingerprint
        ) {
          throw new IdempotencyConflictError();
        }

        return this.toPracticeResult(existingCompletion, true);
      }

      const activity = await this.findActivity(client, activityCode);

      if (activity === undefined) {
        throw new UnknownBalletActivityError();
      }

      const minimumLevel = activity.minimum_level;

      if (level < minimumLevel) {
        throw new BalletActivityLockedError(minimumLevel);
      }

      const latestCompletion = await this.findLatestCompletion(client, discordUserId, activityCode);
      const currentTimeResult = await client.query<CurrentTimeRow>(
        'SELECT clock_timestamp() AS current_time',
      );
      const currentTime = currentTimeResult.rows[0]?.current_time;

      if (currentTime === undefined) {
        throw new Error('Database did not return the current time for ballet practice.');
      }

      if (
        latestCompletion !== undefined &&
        currentTime.getTime() < latestCompletion.next_available_at.getTime()
      ) {
        throw new BalletCooldownError(latestCompletion.next_available_at);
      }

      const xpAwarded = BigInt(activity.xp_reward);
      const slippersAwarded = BigInt(activity.slippers_reward);
      const totalXpAfter = totalXp + xpAwarded;

      if (totalXpAfter > MAX_POSTGRES_BIGINT) {
        throw new BalletXpLimitError();
      }

      const newLevel = getBalletLevel(totalXpAfter);
      const cooldownMs = Number(activity.cooldown_ms);

      if (!Number.isSafeInteger(cooldownMs) || cooldownMs <= 0) {
        throw new Error('Ballet activity has an invalid cooldown configuration.');
      }

      const nextAvailableAt = new Date(currentTime.getTime() + cooldownMs);
      const walletMutation = await this.wallet.creditWithinTransaction(client, {
        interactionId,
        discordUserId,
        amount: slippersAwarded,
        reason: 'BALLET_ACTIVITY',
      });
      await client.query(
        `UPDATE ballet_progress
         SET total_xp = $2, level = $3, updated_at = now()
         WHERE discord_user_id = $1`,
        [discordUserId, totalXpAfter.toString(), newLevel],
      );
      const completionResult = await client.query<InsertedCompletionRow>(
        `INSERT INTO ballet_activity_completions (
           interaction_id, discord_user_id, activity_code, request_fingerprint,
           xp_awarded, slippers_awarded, total_xp_after, level_after,
           wallet_transaction_id, completed_at, next_available_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING completed_at, next_available_at`,
        [
          interactionId,
          discordUserId,
          activityCode,
          requestFingerprint,
          xpAwarded.toString(),
          slippersAwarded.toString(),
          totalXpAfter.toString(),
          newLevel,
          walletMutation.transactionId,
          currentTime,
          nextAvailableAt,
        ],
      );
      const completion = completionResult.rows[0];

      if (completion === undefined) {
        throw new Error('Ballet activity completion was not recorded.');
      }

      return {
        activityCode: this.parseActivityCode(activity.activity_code),
        displayName: activity.display_name,
        xpAwarded,
        slippersAwarded,
        totalXp: totalXpAfter,
        level: newLevel,
        nextLevelXp: getXpToNextLevel(totalXpAfter),
        nextAvailableAt: completion.next_available_at,
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
      throw new Error('Discord user row could not be locked for ballet practice.');
    }
  }

  private async findActivity(
    client: PoolClient,
    activityCode: string,
  ): Promise<ActivityRow | undefined> {
    const result = await client.query<ActivityRow>(
      `SELECT activity_code, display_name, minimum_level,
              xp_reward, slippers_reward, cooldown_ms
       FROM ballet_activity_catalog
       WHERE activity_code = $1 AND active = true`,
      [activityCode],
    );

    return result.rows[0];
  }

  private async findCompletion(
    client: PoolClient,
    interactionId: string,
  ): Promise<ExistingCompletionRow | undefined> {
    const result = await client.query<ExistingCompletionRow>(
      `SELECT completion.discord_user_id,
              completion.activity_code,
              activity.display_name,
              completion.request_fingerprint,
              completion.xp_awarded,
              completion.slippers_awarded,
              completion.total_xp_after,
              completion.level_after,
              completion.completed_at,
              completion.next_available_at,
              ledger.balance_after AS wallet_balance_after
       FROM ballet_activity_completions AS completion
       INNER JOIN ballet_activity_catalog AS activity
         ON activity.activity_code = completion.activity_code
       INNER JOIN wallet_ledger AS ledger
         ON ledger.transaction_id = completion.wallet_transaction_id
        AND ledger.discord_user_id = completion.discord_user_id
       WHERE completion.interaction_id = $1`,
      [interactionId],
    );

    return result.rows[0];
  }

  private async findLatestCompletion(
    client: PoolClient,
    discordUserId: string,
    activityCode: string,
  ): Promise<LatestCompletionRow | undefined> {
    const result = await client.query<LatestCompletionRow>(
      `SELECT next_available_at
       FROM ballet_activity_completions
       WHERE discord_user_id = $1 AND activity_code = $2
       ORDER BY completed_at DESC, interaction_id DESC
       LIMIT 1`,
      [discordUserId, activityCode],
    );

    return result.rows[0];
  }

  private parseActivityCode(value: string): BalletActivityCode {
    if ((BALLET_ACTIVITY_CODES as readonly string[]).includes(value)) {
      return value as BalletActivityCode;
    }

    throw new Error(`Ballet activity catalog has an unsupported code: ${value}`);
  }

  private toPracticeResult(
    completion: ExistingCompletionRow,
    replayed: boolean,
  ): BalletPracticeResult {
    const totalXp = BigInt(completion.total_xp_after);

    return {
      activityCode: this.parseActivityCode(completion.activity_code),
      displayName: completion.display_name,
      xpAwarded: BigInt(completion.xp_awarded),
      slippersAwarded: BigInt(completion.slippers_awarded),
      totalXp,
      level: completion.level_after,
      nextLevelXp: getXpToNextLevel(totalXp),
      nextAvailableAt: completion.next_available_at,
      walletBalance: BigInt(completion.wallet_balance_after),
      replayed,
    };
  }
}
