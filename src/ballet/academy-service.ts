import type { Pool, QueryResultRow } from 'pg';

import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import type { PerformanceTier } from '../performance/types.js';
import { getBalletAcademyProgress } from './academy.js';
import type { BalletAcademyProgress, BalletAcademyEvidence } from './academy.js';

interface AcademyEvidenceRow extends QueryResultRow {
  readonly level: number;
  readonly completed_activity_codes: string[];
  readonly best_performance_tiers: string[];
  readonly technique: number;
  readonly musicality: number;
  readonly performance: number;
}

export interface BalletAcademyPort {
  getProgress(discordUserId: string): Promise<BalletAcademyProgress>;
}

export class BalletAcademyService implements BalletAcademyPort {
  public constructor(private readonly pool: Pool) {}

  public async getProgress(discordUserId: string): Promise<BalletAcademyProgress> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<AcademyEvidenceRow>(
      `SELECT
         COALESCE((SELECT level FROM ballet_progress WHERE discord_user_id = $1), 1) AS level,
         COALESCE((
           SELECT array_agg(activity_code ORDER BY activity_code)
           FROM (
             SELECT DISTINCT activity_code
             FROM ballet_activity_completions
             WHERE discord_user_id = $1
           ) AS completed
         ), ARRAY[]::text[]) AS completed_activity_codes,
         COALESCE((
           SELECT array_agg(performance_id || ':' || tier ORDER BY performance_id)
           FROM (
             SELECT DISTINCT ON (performance_id) performance_id, tier
             FROM ballet_performance_completions
             WHERE discord_user_id = $1
             ORDER BY performance_id, score DESC, completed_at, interaction_id
           ) AS best
         ), ARRAY[]::text[]) AS best_performance_tiers,
         COALESCE((SELECT stat_value FROM ballet_stats
                   WHERE discord_user_id = $1 AND stat_key = 'technique'), 0) AS technique,
         COALESCE((SELECT stat_value FROM ballet_stats
                   WHERE discord_user_id = $1 AND stat_key = 'musicality'), 0) AS musicality,
         COALESCE((SELECT stat_value FROM ballet_stats
                   WHERE discord_user_id = $1 AND stat_key = 'performance'), 0) AS performance`,
      [discordUserId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('Ballet Academy evidence query returned no row.');

    const bestPerformanceTiers: Record<string, PerformanceTier> = {};
    for (const entry of row.best_performance_tiers) {
      const separator = entry.lastIndexOf(':');
      const performanceId = entry.slice(0, separator);
      const tier = entry.slice(separator + 1);
      if (separator < 1 || !isPerformanceTier(tier)) {
        throw new Error('Database returned invalid Ballet performance evidence.');
      }
      bestPerformanceTiers[performanceId] = tier;
    }

    const evidence: BalletAcademyEvidence = {
      level: row.level,
      completedActivityCodes: row.completed_activity_codes,
      bestPerformanceTiers,
      technique: row.technique,
      musicality: row.musicality,
      performance: row.performance,
    };
    return getBalletAcademyProgress(evidence);
  }
}

function isPerformanceTier(value: string): value is PerformanceTier {
  return value === 'BRONZE' || value === 'SILVER' || value === 'GOLD' || value === 'PRIMA';
}
