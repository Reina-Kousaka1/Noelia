import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../database/transaction.js';
import { IdempotencyConflictError } from '../economy/errors.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import { AchievementNotUnlockedError, AchievementUnknownError } from './errors.js';
import { ACHIEVEMENT_IDS } from './types.js';
import type {
  AchievementFeatureResult,
  AchievementId,
  AchievementPort,
  AchievementSummary,
  FeaturedAchievement,
} from './types.js';

interface AchievementRow extends QueryResultRow {
  readonly achievement_id: string;
  readonly display_name: string;
  readonly description: string;
  readonly badge_mark: string;
  readonly unlocked_at: Date | null;
  readonly featured: boolean;
}

interface FeaturedRow extends QueryResultRow {
  readonly achievement_id: string;
  readonly display_name: string;
  readonly description: string;
  readonly badge_mark: string;
}

interface RequestRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly operation: 'FEATURE' | 'CLEAR';
  readonly request_fingerprint: string;
  readonly result: unknown;
}

interface UserRow extends QueryResultRow {
  readonly discord_user_id: string;
}

const achievementIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class AchievementService implements AchievementPort {
  public constructor(private readonly pool: Pool) {}

  public async list(discordUserId: string): Promise<readonly AchievementSummary[]> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<AchievementRow>(
      `SELECT catalog.achievement_id, catalog.display_name, catalog.description,
              catalog.badge_mark, unlocked.unlocked_at,
              (featured.achievement_id IS NOT NULL) AS featured
       FROM achievement_catalog AS catalog
       LEFT JOIN user_achievements AS unlocked
         ON unlocked.achievement_id = catalog.achievement_id
        AND unlocked.discord_user_id = $1
       LEFT JOIN featured_user_achievements AS featured
         ON featured.discord_user_id = $1
        AND featured.achievement_id = catalog.achievement_id
       WHERE catalog.active = true
       ORDER BY (unlocked.unlocked_at IS NULL), unlocked.unlocked_at, catalog.achievement_id`,
      [discordUserId],
    );
    return result.rows.map((row) => this.toSummary(row));
  }

  public async getFeatured(discordUserId: string): Promise<FeaturedAchievement | null> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<FeaturedRow>(
      `SELECT catalog.achievement_id, catalog.display_name, catalog.description, catalog.badge_mark
       FROM featured_user_achievements AS featured
       INNER JOIN achievement_catalog AS catalog
         ON catalog.achievement_id = featured.achievement_id
       WHERE featured.discord_user_id = $1 AND catalog.active = true`,
      [discordUserId],
    );
    const row = result.rows[0];
    return row === undefined ? null : this.toFeatured(row);
  }

  public async feature(
    interactionId: string,
    discordUserId: string,
    achievementId: string,
  ): Promise<AchievementFeatureResult> {
    if (!achievementIdPattern.test(achievementId)) throw new AchievementUnknownError();
    return this.mutateFeature(interactionId, discordUserId, 'FEATURE', achievementId);
  }

  public async clearFeatured(
    interactionId: string,
    discordUserId: string,
  ): Promise<AchievementFeatureResult> {
    return this.mutateFeature(interactionId, discordUserId, 'CLEAR', null);
  }

  private async mutateFeature(
    interactionId: string,
    discordUserId: string,
    operation: 'FEATURE' | 'CLEAR',
    achievementId: string | null,
  ): Promise<AchievementFeatureResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const fingerprint = createHash('sha256')
      .update(
        `${discordUserId}\u0000ACHIEVEMENT_FEATURE\u0000${operation}\u0000${achievementId ?? ''}`,
      )
      .digest('hex');

    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUser(client, discordUserId);
      const existing = await client.query<RequestRow>(
        `SELECT discord_user_id, operation, request_fingerprint, result
         FROM achievement_feature_requests WHERE interaction_id = $1`,
        [interactionId],
      );
      const request = existing.rows[0];
      if (request !== undefined) {
        if (
          request.discord_user_id !== discordUserId ||
          request.operation !== operation ||
          request.request_fingerprint !== fingerprint
        ) {
          throw new IdempotencyConflictError();
        }
        return { ...this.parseFeatureResult(request.result), replayed: true };
      }

      let achievement: FeaturedAchievement | null = null;
      if (achievementId === null) {
        await client.query('DELETE FROM featured_user_achievements WHERE discord_user_id = $1', [
          discordUserId,
        ]);
      } else {
        const owned = await client.query<FeaturedRow>(
          `SELECT catalog.achievement_id, catalog.display_name, catalog.description, catalog.badge_mark
           FROM user_achievements AS unlocked
           INNER JOIN achievement_catalog AS catalog
             ON catalog.achievement_id = unlocked.achievement_id AND catalog.active = true
           WHERE unlocked.discord_user_id = $1 AND unlocked.achievement_id = $2
           FOR SHARE OF unlocked, catalog`,
          [discordUserId, achievementId],
        );
        const row = owned.rows[0];
        if (row === undefined) {
          const known = await client.query(
            'SELECT 1 FROM achievement_catalog WHERE achievement_id = $1 AND active = true',
            [achievementId],
          );
          if (known.rows[0] === undefined) throw new AchievementUnknownError();
          throw new AchievementNotUnlockedError();
        }
        achievement = this.toFeatured(row);
        await client.query(
          `INSERT INTO featured_user_achievements (discord_user_id, achievement_id)
           VALUES ($1, $2)
           ON CONFLICT (discord_user_id) DO UPDATE
           SET achievement_id = EXCLUDED.achievement_id, updated_at = now()`,
          [discordUserId, achievementId],
        );
      }

      const result = { achievement };
      await client.query(
        `INSERT INTO achievement_feature_requests (
           interaction_id, discord_user_id, operation, request_fingerprint, result
         ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [interactionId, discordUserId, operation, fingerprint, JSON.stringify(result)],
      );
      return { ...result, replayed: false };
    });
  }

  private async ensureAndLockUser(client: PoolClient, discordUserId: string): Promise<void> {
    await client.query(
      `INSERT INTO discord_users (discord_user_id)
       VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
    const result = await client.query<UserRow>(
      `SELECT discord_user_id FROM discord_users WHERE discord_user_id = $1 FOR UPDATE`,
      [discordUserId],
    );
    if (result.rows[0] === undefined) throw new Error('Discord user row could not be locked.');
  }

  private toSummary(row: AchievementRow): AchievementSummary {
    const achievementId = this.parseId(row.achievement_id);
    return {
      achievementId,
      displayName: row.display_name,
      description: row.description,
      badgeMark: row.badge_mark,
      unlockedAt: row.unlocked_at,
      featured: row.featured,
    };
  }

  private toFeatured(row: FeaturedRow): FeaturedAchievement {
    return {
      achievementId: this.parseId(row.achievement_id),
      displayName: row.display_name,
      description: row.description,
      badgeMark: row.badge_mark,
    };
  }

  private parseFeatureResult(value: unknown): Omit<AchievementFeatureResult, 'replayed'> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Stored achievement feature result is invalid.');
    }
    const result = value as { readonly achievement?: unknown };
    if (result.achievement === null) return { achievement: null };
    if (
      result.achievement === undefined ||
      typeof result.achievement !== 'object' ||
      Array.isArray(result.achievement)
    ) {
      throw new Error('Stored featured achievement is invalid.');
    }
    const achievement = result.achievement as Record<string, unknown>;
    if (
      typeof achievement.displayName !== 'string' ||
      typeof achievement.description !== 'string' ||
      typeof achievement.badgeMark !== 'string'
    ) {
      throw new Error('Stored featured achievement fields are invalid.');
    }
    return {
      achievement: {
        achievementId: this.parseId(achievement.achievementId),
        displayName: achievement.displayName,
        description: achievement.description,
        badgeMark: achievement.badgeMark,
      },
    };
  }

  private parseId(value: unknown): AchievementId {
    if (typeof value !== 'string' || !(ACHIEVEMENT_IDS as readonly string[]).includes(value)) {
      throw new Error('Database returned an unknown achievement ID.');
    }
    return value as AchievementId;
  }
}
