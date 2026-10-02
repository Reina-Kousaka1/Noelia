import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import { withTransaction } from '../database/transaction.js';
import { unlockAchievement } from '../achievements/unlock.js';
import { IdempotencyConflictError } from '../economy/errors.js';
import type { WalletCreditTransactionPort } from '../economy/ports.js';
import type { BalletActivityCode } from './activity-codes.js';
import {
  BalletActivityLockedError,
  BalletActivityRequirementError,
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
  BalletStatKey,
  BalletStatRequirementProgress,
  BalletStats,
} from './types.js';
import { BALLET_ACTIVITY_CODES } from './activity-codes.js';
import { BALLET_STAT_KEYS } from './types.js';
import { loadAcademyUniformStatus } from './academy-service.js';
import { AcademyUniformRequirementError } from './errors.js';

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
  readonly description: string;
  readonly category: string;
  readonly minimum_level: number;
  readonly xp_reward: string;
  readonly slippers_reward: string;
  readonly cooldown_ms: string;
  readonly stat_key: string;
  readonly stat_gain: number;
  readonly required_equipped_item_id: string | null;
  readonly required_activity_code: string | null;
}

interface ActivityListRow extends ActivityRow {
  readonly current_level: number;
  readonly current_time: Date;
  readonly next_available_at: Date | null;
  readonly equipment_requirement_met: boolean;
  readonly activity_requirement_met: boolean;
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
  readonly stat_key: string | null;
  readonly stat_gain: number | null;
  readonly stat_value_after: number | null;
}

interface CurrentTimeRow extends QueryResultRow {
  readonly current_time: Date;
}

interface InsertedCompletionRow extends QueryResultRow {
  readonly completed_at: Date;
  readonly next_available_at: Date;
}

interface StatValueRow extends QueryResultRow {
  readonly stat_value: number;
}

interface ActivityStatRequirementRow extends QueryResultRow {
  readonly stat_key: string;
  readonly minimum_value: number;
  readonly stat_value: number;
}

interface ListedActivityStatRequirementRow extends ActivityStatRequirementRow {
  readonly activity_code: string;
}

interface StatListRow extends QueryResultRow {
  readonly stat_key: string;
  readonly stat_value: number;
}

const EMPTY_STATS: BalletStats = {
  technique: 0,
  flexibility: 0,
  musicality: 0,
  performance: 0,
  pointe: 0,
  stamina: 0,
};

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
    const stats = await this.getStats(discordUserId);

    return {
      totalXp,
      level,
      xpToNextLevel: getXpToNextLevel(totalXp),
      stats,
    };
  }

  public async listActivities(discordUserId: string): Promise<readonly BalletActivityView[]> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<ActivityListRow>(
      `SELECT activity.activity_code,
              activity.display_name,
              activity.description,
              activity.category,
              activity.minimum_level,
              activity.xp_reward,
              activity.slippers_reward,
              activity.cooldown_ms,
              activity.stat_key,
              activity.stat_gain,
              activity.required_equipped_item_id,
              activity.required_activity_code,
              COALESCE(progress.level, 1) AS current_level,
              clock_timestamp() AS current_time,
              latest.next_available_at,
              (activity.required_equipped_item_id IS NULL OR EXISTS (
                SELECT 1 FROM wardrobe_equipment AS equipment
                WHERE equipment.discord_user_id = $1
                  AND equipment.item_id = activity.required_equipped_item_id
              )) AS equipment_requirement_met,
              (activity.required_activity_code IS NULL OR EXISTS (
                SELECT 1 FROM ballet_activity_completions AS requirement
                WHERE requirement.discord_user_id = $1
                  AND requirement.activity_code = activity.required_activity_code
              )) AS activity_requirement_met
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
    const requirementsResult = await this.pool.query<ListedActivityStatRequirementRow>(
      `SELECT requirement.activity_code,
              requirement.stat_key,
              requirement.minimum_value,
              COALESCE(stat.stat_value, 0) AS stat_value
       FROM ballet_activity_stat_requirements AS requirement
       LEFT JOIN ballet_stats AS stat
         ON stat.discord_user_id = $1
        AND stat.stat_key = requirement.stat_key
       WHERE requirement.activity_code = ANY($2::text[])
       ORDER BY requirement.activity_code, requirement.stat_key`,
      [discordUserId, result.rows.map((row) => row.activity_code)],
    );
    const requirementsByActivity = new Map<string, BalletStatRequirementProgress[]>();
    for (const requirement of requirementsResult.rows) {
      const list = requirementsByActivity.get(requirement.activity_code) ?? [];
      list.push({
        key: this.parseStatKey(requirement.stat_key),
        minimum: requirement.minimum_value,
        current: requirement.stat_value,
        met: requirement.stat_value >= requirement.minimum_value,
      });
      requirementsByActivity.set(requirement.activity_code, list);
    }

    return result.rows.map((row) => {
      const nextAvailableAt = row.next_available_at;
      const levelLocked = row.current_level < row.minimum_level;
      const requirementMet = row.equipment_requirement_met && row.activity_requirement_met;
      const statRequirements = requirementsByActivity.get(row.activity_code) ?? [];
      const statsMet = statRequirements.every((requirement) => requirement.met);
      const availability =
        levelLocked || !requirementMet || !statsMet
          ? 'LOCKED'
          : nextAvailableAt !== null && row.current_time.getTime() < nextAvailableAt.getTime()
            ? 'COOLDOWN'
            : 'AVAILABLE';

      return {
        code: this.parseActivityCode(row.activity_code),
        displayName: row.display_name,
        description: row.description,
        category: row.category,
        minimumLevel: row.minimum_level,
        xpReward: BigInt(row.xp_reward),
        slippersReward: BigInt(row.slippers_reward),
        statKey: this.parseStatKey(row.stat_key),
        statGain: row.stat_gain,
        statRequirements,
        requiredEquippedItemId: row.required_equipped_item_id,
        requiredActivityCode:
          row.required_activity_code === null
            ? null
            : this.parseActivityCode(row.required_activity_code),
        requirementMet: requirementMet && statsMet,
        lockReason: levelLocked
          ? 'LEVEL'
          : !requirementMet
            ? 'REQUIREMENT'
            : !statsMet
              ? 'STATS'
              : null,
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
      await this.ensureStatRows(client, discordUserId);
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

      if (activity.required_activity_code !== null) {
        const prerequisite = await client.query(
          `SELECT 1
           FROM ballet_activity_completions
           WHERE discord_user_id = $1 AND activity_code = $2
           LIMIT 1`,
          [discordUserId, activity.required_activity_code],
        );
        if (prerequisite.rows.length === 0) {
          throw new BalletActivityRequirementError('PREVIOUS_ACTIVITY');
        }
      }
      const statRequirements = await client.query<ActivityStatRequirementRow>(
        `SELECT requirement.stat_key, requirement.minimum_value, stat.stat_value
         FROM ballet_activity_stat_requirements AS requirement
         INNER JOIN ballet_stats AS stat
           ON stat.discord_user_id = $1 AND stat.stat_key = requirement.stat_key
         WHERE requirement.activity_code = $2
         ORDER BY requirement.stat_key
         FOR UPDATE OF stat`,
        [discordUserId, activityCode],
      );
      if (statRequirements.rows.some((row) => row.stat_value < row.minimum_value)) {
        throw new BalletActivityRequirementError('STATS');
      }

      const uniform = await loadAcademyUniformStatus(
        client,
        discordUserId,
        activity.required_equipped_item_id,
      );
      if (!uniform.ready) throw new AcademyUniformRequirementError(uniform);

      if (activity.required_equipped_item_id !== null) {
        const equipment = await client.query(
          `SELECT 1
           FROM wardrobe_equipment
           WHERE discord_user_id = $1 AND item_id = $2
           LIMIT 1`,
          [discordUserId, activity.required_equipped_item_id],
        );
        if (equipment.rows.length === 0) {
          throw new BalletActivityRequirementError('EQUIPMENT');
        }
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
      const statKey = this.parseStatKey(activity.stat_key);
      const currentStatResult = await client.query<StatValueRow>(
        `SELECT stat_value FROM ballet_stats
         WHERE discord_user_id = $1 AND stat_key = $2
         FOR UPDATE`,
        [discordUserId, statKey],
      );
      const currentStat = currentStatResult.rows[0]?.stat_value;
      if (currentStat === undefined) {
        throw new Error('Ballet stat row could not be locked after initialization.');
      }
      const statValueAfter = Math.min(100, currentStat + activity.stat_gain);
      const statGain = statValueAfter - currentStat;
      await client.query(
        `UPDATE ballet_stats
         SET stat_value = $3, updated_at = now()
         WHERE discord_user_id = $1 AND stat_key = $2`,
        [discordUserId, statKey, statValueAfter],
      );
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
           wallet_transaction_id, stat_key, stat_gain, stat_value_after,
           completed_at, next_available_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
          statKey,
          statGain,
          statValueAfter,
          currentTime,
          nextAvailableAt,
        ],
      );
      const completion = completionResult.rows[0];

      if (completion === undefined) {
        throw new Error('Ballet activity completion was not recorded.');
      }

      await unlockAchievement(
        client,
        discordUserId,
        'first-steps',
        'BALLET_ACTIVITY',
        interactionId,
      );
      if (newLevel >= 10) {
        await unlockAchievement(
          client,
          discordUserId,
          'ballet-level-ten',
          'BALLET_LEVEL',
          interactionId,
        );
      }

      return {
        activityCode: this.parseActivityCode(activity.activity_code),
        displayName: activity.display_name,
        xpAwarded,
        slippersAwarded,
        stat: { key: statKey, gain: statGain, value: statValueAfter },
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
      `SELECT activity_code, display_name, description, category, minimum_level,
              xp_reward, slippers_reward, cooldown_ms, stat_key, stat_gain,
              required_equipped_item_id, required_activity_code
       FROM ballet_activity_catalog
       WHERE activity_code = $1 AND active = true`,
      [activityCode],
    );

    return result.rows[0];
  }

  private async ensureStatRows(client: PoolClient, discordUserId: string): Promise<void> {
    for (const statKey of BALLET_STAT_KEYS) {
      await client.query(
        `INSERT INTO ballet_stats (discord_user_id, stat_key)
         VALUES ($1, $2)
         ON CONFLICT (discord_user_id, stat_key) DO NOTHING`,
        [discordUserId, statKey],
      );
    }
  }

  private async getStats(discordUserId: string): Promise<BalletStats> {
    const result = await this.pool.query<StatListRow>(
      `SELECT stat_key, stat_value
       FROM ballet_stats
       WHERE discord_user_id = $1`,
      [discordUserId],
    );
    const stats = { ...EMPTY_STATS };
    for (const row of result.rows) {
      stats[this.parseStatKey(row.stat_key)] = row.stat_value;
    }
    return stats;
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
              ledger.balance_after AS wallet_balance_after,
              completion.stat_key,
              completion.stat_gain,
              completion.stat_value_after
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

  private parseStatKey(value: string): BalletStatKey {
    if ((BALLET_STAT_KEYS as readonly string[]).includes(value)) {
      return value as BalletStatKey;
    }
    throw new Error(`Ballet stat catalog has an unsupported key: ${value}`);
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
      stat:
        completion.stat_key === null ||
        completion.stat_gain === null ||
        completion.stat_value_after === null
          ? null
          : {
              key: this.parseStatKey(completion.stat_key),
              gain: completion.stat_gain,
              value: completion.stat_value_after,
            },
      totalXp,
      level: completion.level_after,
      nextLevelXp: getXpToNextLevel(totalXp),
      nextAvailableAt: completion.next_available_at,
      walletBalance: BigInt(completion.wallet_balance_after),
      replayed,
    };
  }
}
