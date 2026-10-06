import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import { withTransaction } from '../database/transaction.js';
import { unlockAchievement } from '../achievements/unlock.js';
import { IdempotencyConflictError } from '../economy/errors.js';
import { AcademyEnrollmentRequiredError, AcademyUniformAlreadyClaimedError } from './errors.js';
import type { PerformanceTier } from '../performance/types.js';
import {
  canonicalAcademyStageId,
  getBalletAcademyProgress,
  getBalletAcademyProgressAtStage,
} from './academy.js';
import type { BalletAcademyProgress, BalletAcademyEvidence } from './academy.js';
import { createAcademyUniformStatus, readAcademyUniformItems } from './uniform.js';
import type {
  AcademyUniformCatalogRow,
  AcademyUniformClaimResult,
  AcademyUniformStatus,
} from './uniform.js';

interface AcademyEvidenceRow extends QueryResultRow {
  readonly persisted_stage_id?: string | null;
  readonly level: number;
  readonly completed_activity_codes: string[];
  readonly best_performance_tiers: string[];
  readonly knowledge_lesson_counts: Record<string, number>;
  readonly technique: number;
  readonly flexibility: number;
  readonly musicality: number;
  readonly performance: number;
  readonly pointe: number;
  readonly stamina: number;
}

export interface BalletAcademyPort {
  getProgress(discordUserId: string): Promise<BalletAcademyProgress>;
  getUniformStatus(discordUserId: string): Promise<AcademyUniformStatus>;
  claimStarterUniform?(
    interactionId: string,
    discordUserId: string,
  ): Promise<AcademyUniformClaimResult>;
  claimStarterUniformInTransaction?(
    client: PoolClient,
    interactionId: string,
    discordUserId: string,
  ): Promise<AcademyUniformClaimResult>;
}

interface StarterUniformItemRow extends QueryResultRow {
  readonly item_id: string;
  readonly display_name: string;
  readonly academy_starter: boolean;
}

interface StarterUniformClaimRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly leotard_display_name: string;
  readonly tights_display_name: string;
  readonly shoes_display_name: string;
  readonly replaced_item_names: string[];
}

export class BalletAcademyService implements BalletAcademyPort {
  public constructor(private readonly pool: Pool) {}

  public async getProgress(discordUserId: string): Promise<BalletAcademyProgress> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    return loadBalletAcademyProgress(this.pool, discordUserId);
  }

  public async getUniformStatus(discordUserId: string): Promise<AcademyUniformStatus> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    return loadAcademyUniformStatus(this.pool, discordUserId);
  }

  public async claimStarterUniform(
    interactionId: string,
    discordUserId: string,
  ): Promise<AcademyUniformClaimResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    return withTransaction(this.pool, (client) =>
      this.claimStarterUniformInTransaction(client, interactionId, discordUserId),
    );
  }

  public async claimStarterUniformInTransaction(
    client: PoolClient,
    interactionId: string,
    discordUserId: string,
  ): Promise<AcademyUniformClaimResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    await client.query(
      `INSERT INTO discord_users (discord_user_id) VALUES ($1)
         ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
    const locked = await client.query(
      'SELECT discord_user_id FROM discord_users WHERE discord_user_id = $1 FOR UPDATE',
      [discordUserId],
    );
    if (locked.rows.length === 0) throw new Error('Discord user row could not be locked.');

    const enrollment = await client.query(
      'SELECT 1 FROM ballet_academy_enrollments WHERE discord_user_id = $1 FOR SHARE',
      [discordUserId],
    );
    if (enrollment.rows.length === 0) throw new AcademyEnrollmentRequiredError();

    const replay = await client.query<StarterUniformClaimRow>(
      `SELECT claim.discord_user_id,
                claim.leotard_display_name,
                claim.tights_display_name,
                claim.shoes_display_name,
                claim.replaced_item_names
         FROM ballet_academy_uniform_claims AS claim
         WHERE claim.interaction_id = $1
         FOR UPDATE OF claim`,
      [interactionId],
    );
    const replayRow = replay.rows[0];
    if (replayRow !== undefined) {
      if (replayRow.discord_user_id !== discordUserId) throw new IdempotencyConflictError();
      return {
        items: [
          replayRow.leotard_display_name,
          replayRow.tights_display_name,
          replayRow.shoes_display_name,
        ],
        replacedItems: replayRow.replaced_item_names,
        replayed: true,
      };
    }

    const priorClaim = await client.query(
      'SELECT 1 FROM ballet_academy_uniform_claims WHERE discord_user_id = $1',
      [discordUserId],
    );
    if (priorClaim.rows.length > 0) throw new AcademyUniformAlreadyClaimedError();

    const selected: StarterUniformItemRow[] = [];
    for (const [role, slot] of [
      ['academy-leotard', 'leotard'],
      ['academy-tights', 'tights'],
      ['academy-flat', 'shoes'],
    ] as const) {
      const item = await client.query<StarterUniformItemRow>(
        `SELECT item.item_id, item.display_name,
                  (item.cosmetic_metadata ->> 'academy_starter' = 'true') AS academy_starter
           FROM shop_catalog AS item
           WHERE item.active = true
             AND (item.purchasable = true OR item.cosmetic_metadata ->> 'academy_starter' = 'true')
             AND item.minimum_ballet_level <= 1
             AND item.category NOT IN ('seasonal', 'event_item')
             AND item.cosmetic_metadata -> 'academy_uniform_roles' ? $1
             AND item.cosmetic_metadata -> 'slots' @> $2::jsonb
           ORDER BY COALESCE(item.cosmetic_metadata ->> 'academy_starter' = 'true', false) DESC,
                    item.price, item.item_id
           LIMIT 1
           FOR SHARE`,
        [role, JSON.stringify([slot])],
      );
      const row = item.rows[0];
      if (row === undefined) {
        throw new Error(`No permanent level-one catalog item is configured for ${role}.`);
      }
      selected.push(row);
    }
    const leotard = selected[0];
    const tights = selected[1];
    const shoes = selected[2];
    if (leotard === undefined || tights === undefined || shoes === undefined) {
      throw new Error('The Academy starter uniform catalog selection is incomplete.');
    }

    const displaced = await client.query<{ readonly display_name: string }>(
      `SELECT item.display_name
         FROM wardrobe_equipment AS equipment
         INNER JOIN shop_catalog AS item ON item.item_id = equipment.item_id
         WHERE equipment.discord_user_id = $1
           AND equipment.slot = ANY(ARRAY['leotard', 'tights', 'shoes']::text[])
         ORDER BY item.display_name
         FOR UPDATE OF equipment`,
      [discordUserId],
    );
    await client.query(
      `INSERT INTO ballet_academy_uniform_claims (
           interaction_id, discord_user_id,
           leotard_item_id, leotard_display_name,
           tights_item_id, tights_display_name,
           shoes_item_id, shoes_display_name, replaced_item_names
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        interactionId,
        discordUserId,
        leotard.item_id,
        leotard.display_name,
        tights.item_id,
        tights.display_name,
        shoes.item_id,
        shoes.display_name,
        displaced.rows.map((row) => row.display_name),
      ],
    );
    for (const item of selected) {
      await client.query(
        `INSERT INTO user_inventory (discord_user_id, item_id, quantity, source, tradeable)
           VALUES ($1, $2, 1, 'EVENT_REWARD', $3)
           ON CONFLICT (discord_user_id, item_id) DO UPDATE
           SET tradeable = user_inventory.tradeable AND EXCLUDED.tradeable`,
        [discordUserId, item.item_id, !item.academy_starter],
      );
    }
    await client.query(
      `DELETE FROM wardrobe_equipment
         WHERE discord_user_id = $1 AND slot = ANY(ARRAY['leotard', 'tights', 'shoes']::text[])`,
      [discordUserId],
    );
    for (const [item, slot] of [
      [leotard, 'leotard'],
      [tights, 'tights'],
      [shoes, 'shoes'],
    ] as const) {
      await client.query(
        `INSERT INTO wardrobe_equipment (discord_user_id, slot, item_id)
           VALUES ($1, $2, $3)`,
        [discordUserId, slot, item.item_id],
      );
    }
    await unlockAchievement(
      client,
      discordUserId,
      'first-studio-look',
      'WARDROBE_EQUIPPED',
      interactionId,
    );
    return {
      items: selected.map((item) => item.display_name),
      replacedItems: displaced.rows.map((row) => row.display_name),
      replayed: false,
    };
  }
}

export async function loadBalletAcademyProgress(
  queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'>,
  discordUserId: string,
): Promise<BalletAcademyProgress> {
  const { evidence, persistedStageId } = await loadBalletAcademyEvidence(queryable, discordUserId);
  return persistedStageId === null
    ? getBalletAcademyProgress(evidence)
    : getBalletAcademyProgressAtStage(evidence, persistedStageId);
}

export async function loadBalletAcademyEvidence(
  queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'>,
  discordUserId: string,
): Promise<{ readonly evidence: BalletAcademyEvidence; readonly persistedStageId: string | null }> {
  const result = await queryable.query<AcademyEvidenceRow>(
    `SELECT
         (SELECT current_stage_id FROM academy_stage_progress WHERE discord_user_id = $1) AS persisted_stage_id,
         COALESCE((SELECT level FROM ballet_progress WHERE discord_user_id = $1), 1) AS level,
         COALESCE((
           SELECT array_agg(activity_code ORDER BY activity_code)
           FROM (
             SELECT DISTINCT activity_code
             FROM ballet_activity_completions
             WHERE discord_user_id = $1
             UNION
             SELECT DISTINCT academy_activity_code AS activity_code
             FROM academy_training_evidence
             WHERE discord_user_id = $1 AND academy_activity_code IS NOT NULL
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
         COALESCE((
           SELECT jsonb_object_agg(completion.domain, completion.lesson_count)
           FROM (
             SELECT domain, count(*)::integer AS lesson_count
             FROM academy_lesson_completions
             WHERE discord_user_id = $1
             GROUP BY domain
           ) AS completion
         ), '{}'::jsonb) AS knowledge_lesson_counts,
         COALESCE((SELECT stat_value FROM ballet_stats
                   WHERE discord_user_id = $1 AND stat_key = 'technique'), 0) AS technique,
         COALESCE((SELECT stat_value FROM ballet_stats
                   WHERE discord_user_id = $1 AND stat_key = 'flexibility'), 0) AS flexibility,
         COALESCE((SELECT stat_value FROM ballet_stats
                   WHERE discord_user_id = $1 AND stat_key = 'musicality'), 0) AS musicality,
         COALESCE((SELECT stat_value FROM ballet_stats
                   WHERE discord_user_id = $1 AND stat_key = 'performance'), 0) AS performance,
         COALESCE((SELECT stat_value FROM ballet_stats
                   WHERE discord_user_id = $1 AND stat_key = 'pointe'), 0) AS pointe,
         COALESCE((SELECT stat_value FROM ballet_stats
                   WHERE discord_user_id = $1 AND stat_key = 'stamina'), 0) AS stamina`,
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
    knowledge: row.knowledge_lesson_counts,
    technique: row.technique,
    flexibility: row.flexibility,
    musicality: row.musicality,
    performance: row.performance,
    pointe: row.pointe,
    stamina: row.stamina,
  };
  return { evidence, persistedStageId: row.persisted_stage_id ?? null };
}

/**
 * Record the stage a user had reached under the pre-assessment, evidence-only
 * progression. The baseline is captured once and is never rewritten, so adding
 * formal assessment gates cannot demote an existing user.
 * The caller must already hold the Discord user's row lock.
 */
export async function ensureAcademyStageBaseline(
  client: PoolClient,
  discordUserId: string,
): Promise<string> {
  const existing = await client.query<{ readonly current_stage_id: string }>(
    'SELECT current_stage_id FROM academy_stage_progress WHERE discord_user_id = $1 FOR UPDATE',
    [discordUserId],
  );
  const existingStage = existing.rows[0]?.current_stage_id;
  if (existingStage !== undefined) return canonicalAcademyStageId(existingStage);

  const { evidence } = await loadBalletAcademyEvidence(client, discordUserId);
  const legacyStage = getBalletAcademyProgress(evidence).currentRank.id;
  await client.query(
    `INSERT INTO academy_stage_progress (
       discord_user_id, legacy_baseline_stage_id, current_stage_id
     ) VALUES ($1, $2, $2)
     ON CONFLICT (discord_user_id) DO NOTHING`,
    [discordUserId, legacyStage],
  );
  const inserted = await client.query<{ readonly current_stage_id: string }>(
    'SELECT current_stage_id FROM academy_stage_progress WHERE discord_user_id = $1 FOR UPDATE',
    [discordUserId],
  );
  const stage = inserted.rows[0]?.current_stage_id;
  if (stage === undefined) throw new Error('Academy stage baseline could not be recorded.');
  return canonicalAcademyStageId(stage);
}

export async function ensureAndLockAcademyUser(
  client: PoolClient,
  discordUserId: string,
): Promise<void> {
  await client.query(
    'INSERT INTO discord_users (discord_user_id) VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING',
    [discordUserId],
  );
  const locked = await client.query(
    'SELECT discord_user_id FROM discord_users WHERE discord_user_id = $1 FOR UPDATE',
    [discordUserId],
  );
  if (locked.rows.length === 0) throw new Error('Discord user row could not be locked.');
}

export async function loadAcademyUniformStatus(
  queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'>,
  discordUserId: string,
  requiredItemId?: string | null,
): Promise<AcademyUniformStatus> {
  const rankProgress = await loadBalletAcademyProgress(queryable, discordUserId);
  const catalogResult = await queryable.query<AcademyUniformCatalogRow>(
    `SELECT item.item_id, item.display_name, item.category,
              item.minimum_ballet_level,
              item.cosmetic_metadata -> 'academy_uniform_roles' AS academy_uniform_roles,
              inventory.quantity,
              EXISTS (
                SELECT 1 FROM wardrobe_equipment AS equipment
                WHERE equipment.discord_user_id = $1 AND equipment.item_id = item.item_id
              ) AS equipped,
              item.purchasable, item.active
       FROM shop_catalog AS item
       LEFT JOIN user_inventory AS inventory
         ON inventory.discord_user_id = $1 AND inventory.item_id = item.item_id
       WHERE item.cosmetic_metadata ? 'academy_uniform_roles'
       ORDER BY item.category, item.minimum_ballet_level, item.display_name`,
    [discordUserId],
  );
  const progressResult = await queryable.query<{ readonly level: number }>(
    `SELECT COALESCE((SELECT level FROM ballet_progress WHERE discord_user_id = $1), 1) AS level`,
    [discordUserId],
  );
  const items = readAcademyUniformItems(catalogResult.rows);
  const requiredItem =
    requiredItemId === undefined || requiredItemId === null
      ? undefined
      : items.find((item) => item.itemId === requiredItemId);
  const pointeRequired = requiredItem?.roles.includes('academy-pointe') ?? false;
  const balletLevel = progressResult.rows[0]?.level ?? 1;
  return createAcademyUniformStatus(rankProgress.currentRank, items, pointeRequired, balletLevel);
}

function isPerformanceTier(value: string): value is PerformanceTier {
  return value === 'BRONZE' || value === 'SILVER' || value === 'GOLD' || value === 'PRIMA';
}
