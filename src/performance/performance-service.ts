import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { BALLET_STAT_KEYS, type BalletStatKey, type BalletStats } from '../ballet/types.js';
import { getBalletLevel } from '../ballet/progression.js';
import { withTransaction } from '../database/transaction.js';
import { unlockAchievement } from '../achievements/unlock.js';
import { IdempotencyConflictError } from '../economy/errors.js';
import { BalletXpLimitError } from '../ballet/errors.js';
import { AcademyUniformRequirementError } from '../ballet/errors.js';
import { loadAcademyUniformStatus } from '../ballet/academy-service.js';
import type { WalletCreditTransactionPort } from '../economy/ports.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import {
  PerformanceCooldownError,
  PerformanceLockedError,
  PerformancePageError,
  UnknownPerformanceError,
} from './errors.js';
import { calculatePerformanceScore, getPerformanceTier } from './scoring.js';
import type {
  BalletPerformanceHistoryPage,
  BalletPerformanceResult,
  BalletPerformanceView,
  PerformancePort,
  PerformanceStatRequirement,
  PerformanceTier,
  PerformanceLockReason,
} from './types.js';

const PAGE_SIZE = 10;
const MAX_PAGE = 100_000;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const performanceIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface CatalogRow extends QueryResultRow {
  readonly performance_id: string;
  readonly display_name: string;
  readonly description: string;
  readonly minimum_level: number;
  readonly cooldown_ms: string;
  readonly xp_reward: string;
  readonly slippers_reward: string;
  readonly required_equipped_item_id: string | null;
  readonly required_activity_code: string | null;
}

interface PerformanceListRow extends CatalogRow {
  readonly current_level: number;
  readonly current_time: Date;
  readonly next_available_at: Date | null;
  readonly stats_requirements_met: boolean;
  readonly equipment_requirement_met: boolean;
  readonly activity_requirement_met: boolean;
}

interface RequirementRow extends QueryResultRow {
  readonly performance_id: string;
  readonly stat_key: string;
  readonly minimum_value: number;
  readonly score_weight: number;
}

interface UserPerformanceRequirementRow extends RequirementRow {
  readonly stat_value: number;
}

interface ProgressRow extends QueryResultRow {
  readonly total_xp: string;
  readonly level: number;
}

interface StatRow extends QueryResultRow {
  readonly stat_key: string;
  readonly stat_value: number;
}

interface TimeRow extends QueryResultRow {
  readonly current_time: Date;
}

interface ExistingPerformanceRow extends QueryResultRow {
  readonly performance_id: string;
  readonly display_name: string;
  readonly request_fingerprint: string;
  readonly score: number;
  readonly tier: string;
  readonly xp_awarded: string;
  readonly slippers_awarded: string;
  readonly total_xp_after: string;
  readonly level_after: number;
  readonly wallet_balance_after: string;
  readonly completed_at: Date;
  readonly next_available_at: Date;
}

interface InsertedPerformanceRow extends QueryResultRow {
  readonly completed_at: Date;
  readonly next_available_at: Date;
}

interface CountRow extends QueryResultRow {
  readonly total_entries: string;
}

type HistoryRow = ExistingPerformanceRow;

const EMPTY_STATS: BalletStats = {
  technique: 0,
  flexibility: 0,
  musicality: 0,
  performance: 0,
  pointe: 0,
  stamina: 0,
};

export class PerformanceService implements PerformancePort {
  public constructor(
    private readonly pool: Pool,
    private readonly wallet: WalletCreditTransactionPort,
  ) {}

  public async listPerformances(discordUserId: string): Promise<readonly BalletPerformanceView[]> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<PerformanceListRow>(
      `SELECT performance.performance_id,
              performance.display_name,
              performance.description,
              performance.minimum_level,
              performance.cooldown_ms,
              performance.xp_reward,
              performance.slippers_reward,
              performance.required_equipped_item_id,
              performance.required_activity_code,
              COALESCE(progress.level, 1) AS current_level,
              clock_timestamp() AS current_time,
              latest.next_available_at,
              NOT EXISTS (
                SELECT 1
                FROM ballet_performance_stat_requirements AS requirement
                LEFT JOIN ballet_stats AS stat
                  ON stat.discord_user_id = $1
                 AND stat.stat_key = requirement.stat_key
                WHERE requirement.performance_id = performance.performance_id
                  AND COALESCE(stat.stat_value, 0) < requirement.minimum_value
              ) AS stats_requirements_met,
              (performance.required_equipped_item_id IS NULL OR EXISTS (
                SELECT 1 FROM wardrobe_equipment AS equipment
                WHERE equipment.discord_user_id = $1
                  AND equipment.item_id = performance.required_equipped_item_id
              )) AS equipment_requirement_met,
              (performance.required_activity_code IS NULL OR EXISTS (
                SELECT 1 FROM ballet_activity_completions AS activity
                WHERE activity.discord_user_id = $1
                  AND activity.activity_code = performance.required_activity_code
              )) AS activity_requirement_met
       FROM ballet_performance_catalog AS performance
       LEFT JOIN ballet_progress AS progress
         ON progress.discord_user_id = $1
       LEFT JOIN LATERAL (
         SELECT completion.next_available_at
         FROM ballet_performance_completions AS completion
         WHERE completion.discord_user_id = $1
           AND completion.performance_id = performance.performance_id
         ORDER BY completion.completed_at DESC, completion.interaction_id DESC
         LIMIT 1
       ) AS latest ON true
       WHERE performance.active = true
       ORDER BY performance.minimum_level, performance.display_name`,
      [discordUserId],
    );
    const ids = result.rows.map((row) => row.performance_id);
    const requirements = await this.getRequirements(ids);

    return result.rows.map((row) => {
      const levelMet = row.current_level >= row.minimum_level;
      const statsMet = row.stats_requirements_met;
      const equipmentMet = row.equipment_requirement_met;
      const activityMet = row.activity_requirement_met;
      let lockReason: PerformanceLockReason | null = null;
      if (!levelMet) lockReason = 'LEVEL';
      else if (!statsMet) lockReason = 'STATS';
      else if (!equipmentMet) lockReason = 'EQUIPMENT';
      else if (!activityMet) lockReason = 'ACTIVITY';

      const nextAvailableAt = row.next_available_at;
      const availability =
        lockReason !== null
          ? 'LOCKED'
          : nextAvailableAt !== null && row.current_time.getTime() < nextAvailableAt.getTime()
            ? 'COOLDOWN'
            : 'AVAILABLE';

      return {
        performanceId: row.performance_id,
        displayName: row.display_name,
        description: row.description,
        minimumLevel: row.minimum_level,
        xpReward: BigInt(row.xp_reward),
        slippersReward: BigInt(row.slippers_reward),
        requirements: requirements.get(row.performance_id) ?? [],
        requiredEquippedItemId: row.required_equipped_item_id,
        requiredActivityCode: row.required_activity_code,
        availability,
        lockReason,
        nextAvailableAt,
      };
    });
  }

  public async perform(
    interactionId: string,
    discordUserId: string,
    performanceId: string,
  ): Promise<BalletPerformanceResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    if (!performanceIdPattern.test(performanceId)) {
      throw new UnknownPerformanceError();
    }
    const requestFingerprint = createHash('sha256')
      .update(`${discordUserId}\u0000BALLET_PERFORMANCE\u0000${performanceId}`)
      .digest('hex');

    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockProgress(client, discordUserId);
      await this.ensureStatRows(client, discordUserId);
      const existing = await this.findCompletion(client, interactionId);
      if (existing !== undefined) {
        if (
          existing.performance_id !== performanceId ||
          existing.request_fingerprint !== requestFingerprint
        ) {
          throw new IdempotencyConflictError();
        }
        return this.toResult(existing, true);
      }

      const catalog = await this.findCatalog(client, performanceId);
      if (catalog === undefined) throw new UnknownPerformanceError();
      const progressResult = await client.query<ProgressRow>(
        `SELECT total_xp, level
         FROM ballet_progress
         WHERE discord_user_id = $1
         FOR UPDATE`,
        [discordUserId],
      );
      const progress = progressResult.rows[0];
      if (progress === undefined) {
        throw new Error('Ballet progress could not be loaded for a performance.');
      }
      const totalXp = BigInt(progress.total_xp);
      if (progress.level < catalog.minimum_level) throw new PerformanceLockedError('LEVEL');
      if (catalog.required_activity_code !== null) {
        const activity = await client.query(
          `SELECT 1 FROM ballet_activity_completions
           WHERE discord_user_id = $1 AND activity_code = $2
           LIMIT 1`,
          [discordUserId, catalog.required_activity_code],
        );
        if (activity.rows.length === 0) throw new PerformanceLockedError('ACTIVITY');
      }

      const requirementResult = await client.query<UserPerformanceRequirementRow>(
        `SELECT requirement.stat_key,
                requirement.minimum_value,
                requirement.score_weight,
                stat.stat_value
         FROM ballet_performance_stat_requirements AS requirement
         INNER JOIN ballet_stats AS stat
           ON stat.discord_user_id = $1
          AND stat.stat_key = requirement.stat_key
         WHERE requirement.performance_id = $2
         ORDER BY requirement.stat_key
         FOR UPDATE OF stat`,
        [discordUserId, performanceId],
      );
      const statRequirements = requirementResult.rows.map((row) => ({
        key: this.parseStatKey(row.stat_key),
        minimum: row.minimum_value,
        weight: row.score_weight,
      }));
      if (
        statRequirements.length === 0 ||
        requirementResult.rows.some((row) => row.stat_value < row.minimum_value)
      ) {
        throw new PerformanceLockedError('STATS');
      }

      const uniform = await loadAcademyUniformStatus(
        client,
        discordUserId,
        catalog.required_equipped_item_id,
      );
      if (!uniform.ready) throw new AcademyUniformRequirementError(uniform);

      if (catalog.required_equipped_item_id !== null) {
        const item = await client.query(
          `SELECT 1 FROM wardrobe_equipment
           WHERE discord_user_id = $1 AND item_id = $2
           LIMIT 1`,
          [discordUserId, catalog.required_equipped_item_id],
        );
        if (item.rows.length === 0) throw new PerformanceLockedError('EQUIPMENT');
      }
      const currentStats = await this.getStats(client, discordUserId);
      const score = calculatePerformanceScore(statRequirements, currentStats);
      const tier = getPerformanceTier(score);

      const cooldownResult = await client.query<{ readonly next_available_at: Date }>(
        `SELECT next_available_at
         FROM ballet_performance_completions
         WHERE discord_user_id = $1 AND performance_id = $2
         ORDER BY completed_at DESC, interaction_id DESC
         LIMIT 1`,
        [discordUserId, performanceId],
      );
      const currentTimeResult = await client.query<TimeRow>(
        'SELECT clock_timestamp() AS current_time',
      );
      const currentTime = currentTimeResult.rows[0]?.current_time;
      if (currentTime === undefined) throw new Error('Database time is unavailable.');
      const latestAvailable = cooldownResult.rows[0]?.next_available_at;
      if (latestAvailable !== undefined && currentTime.getTime() < latestAvailable.getTime()) {
        throw new PerformanceCooldownError(latestAvailable);
      }

      const xpAwarded = BigInt(catalog.xp_reward);
      const slippersAwarded = BigInt(catalog.slippers_reward);
      const totalXpAfter = totalXp + xpAwarded;
      if (totalXpAfter > MAX_POSTGRES_BIGINT) throw new BalletXpLimitError();
      const cooldownMs = Number(catalog.cooldown_ms);
      if (!Number.isSafeInteger(cooldownMs) || cooldownMs <= 0) {
        throw new Error('Ballet performance has an invalid cooldown configuration.');
      }
      const nextAvailableAt = new Date(currentTime.getTime() + cooldownMs);
      const newLevel = getBalletLevel(totalXpAfter);
      const walletMutation = await this.wallet.creditWithinTransaction(client, {
        interactionId,
        discordUserId,
        amount: slippersAwarded,
        reason: 'PERFORMANCE_REWARD',
      });
      await client.query(
        `UPDATE ballet_progress
         SET total_xp = $2, level = $3, updated_at = now()
         WHERE discord_user_id = $1`,
        [discordUserId, totalXpAfter.toString(), newLevel],
      );
      const inserted = await client.query<InsertedPerformanceRow>(
        `INSERT INTO ballet_performance_completions (
           interaction_id, discord_user_id, performance_id, request_fingerprint,
           score, tier, xp_awarded, slippers_awarded, total_xp_after, level_after,
           wallet_transaction_id, wallet_balance_after, completed_at, next_available_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING completed_at, next_available_at`,
        [
          interactionId,
          discordUserId,
          performanceId,
          requestFingerprint,
          score,
          tier,
          xpAwarded.toString(),
          slippersAwarded.toString(),
          totalXpAfter.toString(),
          newLevel,
          walletMutation.transactionId,
          walletMutation.balance.toString(),
          currentTime,
          nextAvailableAt,
        ],
      );
      const completion = inserted.rows[0];
      if (completion === undefined) throw new Error('Ballet performance was not recorded.');

      await unlockAchievement(
        client,
        discordUserId,
        'first-performance',
        'PERFORMANCE',
        interactionId,
      );
      if (performanceId === 'spring-recital') {
        await unlockAchievement(
          client,
          discordUserId,
          'first-recital',
          'PERFORMANCE',
          interactionId,
        );
      }
      if (tier === 'PRIMA' && performanceId === 'prima-audition') {
        await unlockAchievement(client, discordUserId, 'prima-star', 'PERFORMANCE', interactionId);
      }
      if (tier === 'GOLD' || tier === 'PRIMA') {
        await unlockAchievement(
          client,
          discordUserId,
          'spotlight-moment',
          'PERFORMANCE',
          interactionId,
        );
      }

      return {
        performanceId,
        displayName: catalog.display_name,
        score,
        tier,
        xpAwarded,
        slippersAwarded,
        totalXp: totalXpAfter,
        level: newLevel,
        walletBalance: walletMutation.balance,
        completedAt: completion.completed_at,
        nextAvailableAt: completion.next_available_at,
        replayed: false,
      };
    });
  }

  public async listHistory(
    discordUserId: string,
    page: number,
  ): Promise<BalletPerformanceHistoryPage> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    this.validatePage(page);
    const countResult = await this.pool.query<CountRow>(
      `SELECT count(*)::text AS total_entries
       FROM ballet_performance_completions
       WHERE discord_user_id = $1`,
      [discordUserId],
    );
    const rows = await this.pool.query<HistoryRow>(
      `SELECT completion.performance_id,
              performance.display_name,
              completion.request_fingerprint,
              completion.score,
              completion.tier,
              completion.xp_awarded,
              completion.slippers_awarded,
              completion.total_xp_after,
              completion.level_after,
              completion.wallet_balance_after,
              completion.completed_at,
              completion.next_available_at
       FROM ballet_performance_completions AS completion
       INNER JOIN ballet_performance_catalog AS performance
         ON performance.performance_id = completion.performance_id
       WHERE completion.discord_user_id = $1
       ORDER BY completion.completed_at DESC, completion.interaction_id DESC
       LIMIT $2 OFFSET $3`,
      [discordUserId, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );
    const totalEntries = Number(countResult.rows[0]?.total_entries ?? '0');
    return {
      entries: rows.rows.map((row) => this.toResult(row, false)),
      page,
      pageSize: PAGE_SIZE,
      totalEntries,
      totalPages: Math.max(1, Math.ceil(totalEntries / PAGE_SIZE)),
    };
  }

  private async ensureAndLockProgress(client: PoolClient, discordUserId: string): Promise<void> {
    await client.query(
      `INSERT INTO discord_users (discord_user_id)
       VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
    const user = await client.query(
      `SELECT discord_user_id FROM discord_users
       WHERE discord_user_id = $1 FOR UPDATE`,
      [discordUserId],
    );
    if (user.rows.length === 0) throw new Error('Discord user could not be locked.');
    await client.query(
      `INSERT INTO ballet_progress (discord_user_id)
       VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
  }

  private async ensureStatRows(client: PoolClient, discordUserId: string): Promise<void> {
    for (const statKey of BALLET_STAT_KEYS) {
      await client.query(
        `INSERT INTO ballet_stats (discord_user_id, stat_key)
         VALUES ($1, $2) ON CONFLICT (discord_user_id, stat_key) DO NOTHING`,
        [discordUserId, statKey],
      );
    }
  }

  private async getStats(client: PoolClient, discordUserId: string): Promise<BalletStats> {
    const result = await client.query<StatRow>(
      `SELECT stat_key, stat_value FROM ballet_stats WHERE discord_user_id = $1`,
      [discordUserId],
    );
    const stats = { ...EMPTY_STATS };
    for (const row of result.rows) stats[this.parseStatKey(row.stat_key)] = row.stat_value;
    return stats;
  }

  private async getRequirements(
    performanceIds: readonly string[],
  ): Promise<Map<string, readonly PerformanceStatRequirement[]>> {
    if (performanceIds.length === 0) return new Map();
    const result = await this.pool.query<RequirementRow>(
      `SELECT performance_id, stat_key, minimum_value, score_weight
       FROM ballet_performance_stat_requirements
       WHERE performance_id = ANY($1::text[])
       ORDER BY performance_id, stat_key`,
      [performanceIds],
    );
    const grouped = new Map<string, PerformanceStatRequirement[]>();
    for (const row of result.rows) {
      const list = grouped.get(row.performance_id) ?? [];
      list.push({
        key: this.parseStatKey(row.stat_key),
        minimum: row.minimum_value,
        weight: row.score_weight,
      });
      grouped.set(row.performance_id, list);
    }
    return grouped;
  }

  private async findCatalog(
    client: PoolClient,
    performanceId: string,
  ): Promise<CatalogRow | undefined> {
    const result = await client.query<CatalogRow>(
      `SELECT performance_id, display_name, description, minimum_level,
              cooldown_ms, xp_reward, slippers_reward,
              required_equipped_item_id, required_activity_code
       FROM ballet_performance_catalog
       WHERE performance_id = $1 AND active = true
       FOR SHARE`,
      [performanceId],
    );
    return result.rows[0];
  }

  private async findCompletion(
    client: PoolClient,
    interactionId: string,
  ): Promise<ExistingPerformanceRow | undefined> {
    const result = await client.query<ExistingPerformanceRow>(
      `SELECT completion.performance_id,
              performance.display_name,
              completion.request_fingerprint,
              completion.score,
              completion.tier,
              completion.xp_awarded,
              completion.slippers_awarded,
              completion.total_xp_after,
              completion.level_after,
              completion.wallet_balance_after,
              completion.completed_at,
              completion.next_available_at
       FROM ballet_performance_completions AS completion
       INNER JOIN ballet_performance_catalog AS performance
         ON performance.performance_id = completion.performance_id
       WHERE completion.interaction_id = $1`,
      [interactionId],
    );
    return result.rows[0];
  }

  private toResult(row: ExistingPerformanceRow, replayed: boolean): BalletPerformanceResult {
    return {
      performanceId: row.performance_id,
      displayName: row.display_name,
      score: row.score,
      tier: this.parseTier(row.tier),
      xpAwarded: BigInt(row.xp_awarded),
      slippersAwarded: BigInt(row.slippers_awarded),
      totalXp: BigInt(row.total_xp_after),
      level: row.level_after,
      walletBalance: BigInt(row.wallet_balance_after),
      completedAt: row.completed_at,
      nextAvailableAt: row.next_available_at,
      replayed,
    };
  }

  private parseStatKey(value: string): BalletStatKey {
    if ((BALLET_STAT_KEYS as readonly string[]).includes(value)) return value as BalletStatKey;
    throw new Error(`Unsupported Ballet stat in performance catalog: ${value}`);
  }

  private parseTier(value: string): PerformanceTier {
    if (value === 'BRONZE' || value === 'SILVER' || value === 'GOLD' || value === 'PRIMA') {
      return value;
    }
    throw new Error(`Unsupported Ballet performance tier: ${value}`);
  }

  private validatePage(page: number): void {
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
      throw new PerformancePageError();
    }
  }
}
