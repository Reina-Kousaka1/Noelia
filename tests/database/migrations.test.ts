import type { Pool, PoolClient } from 'pg';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { loadMigrations, runMigrations } from '../../src/database/migrations/runner.js';

const migrationsDirectory = resolve(process.cwd(), 'migrations');

describe('PostgreSQL migrations', () => {
  it('loads contiguous fresh migrations with SHA-256 checksums', async () => {
    const migrations = await loadMigrations(migrationsDirectory);

    expect(migrations).toHaveLength(23);
    expect(migrations[0]).toMatchObject({
      version: 1,
      name: 'initial_schema',
    });
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migrations[0]?.sql).toContain('CREATE TABLE discord_users');
    expect(migrations[1]).toMatchObject({
      version: 2,
      name: 'ballet_slippers_wallet',
    });
    expect(migrations[1]?.sql).toContain('CREATE TABLE wallet_ledger');
    expect(migrations[1]?.sql).toContain('CREATE TRIGGER wallet_ledger_append_only');
    expect(migrations[1]?.sql).toContain('CREATE TRIGGER wallet_ledger_no_truncate');
    expect(migrations[2]).toMatchObject({
      version: 3,
      name: 'daily_claims',
    });
    expect(migrations[2]?.sql).toContain('CREATE TABLE daily_claims');
    expect(migrations[2]?.sql).toContain('CREATE TRIGGER daily_claims_append_only');
    expect(migrations[3]).toMatchObject({
      version: 4,
      name: 'ballet_progression',
    });
    expect(migrations[3]?.sql).toContain('CREATE TABLE ballet_activity_catalog');
    expect(migrations[3]?.sql).toContain('CREATE TABLE ballet_activity_completions');
    expect(migrations[3]?.sql).toContain(
      'CREATE UNIQUE INDEX wallet_transactions_idempotency_id_unique_idx',
    );
    expect(migrations[4]).toMatchObject({
      version: 5,
      name: 'shop_catalog_and_inventory',
    });
    expect(migrations[4]?.sql).toContain('CREATE TABLE shop_catalog');
    expect(migrations[4]?.sql).toContain('CREATE TABLE user_inventory');
    expect(migrations[4]?.sql).toContain('CREATE TABLE shop_purchases');
    expect(migrations[4]?.sql).toContain('CREATE TRIGGER shop_purchases_append_only');
    expect(migrations[4]?.sql).toContain('CREATE TRIGGER shop_purchases_no_truncate');
    expect(migrations[5]).toMatchObject({
      version: 6,
      name: 'wardrobe_equipment',
    });
    expect(migrations[5]?.sql).toContain('CREATE TABLE wardrobe_equipment');
    expect(migrations[5]?.sql).toContain('REFERENCES user_inventory (discord_user_id, item_id)');
    expect(migrations[6]).toMatchObject({
      version: 7,
      name: 'marketplace_escrow',
    });
    expect(migrations[6]?.sql).toContain('CREATE TABLE marketplace_listings');
    expect(migrations[6]?.sql).toContain('CREATE TABLE marketplace_escrow');
    expect(migrations[6]?.sql).toContain('original_acquired_at timestamptz NOT NULL');
    expect(migrations[7]).toMatchObject({
      version: 8,
      name: 'ballet_stats_and_activities',
    });
    expect(migrations[7]?.sql).toContain('CREATE TABLE ballet_stats');
    expect(migrations[7]?.sql).toContain('required_equipped_item_id');
    expect(migrations[7]?.sql).toContain('stat_value_after');
    expect(migrations[8]).toMatchObject({
      version: 9,
      name: 'ballet_performances',
    });
    expect(migrations[8]?.sql).toContain('CREATE TABLE ballet_performance_catalog');
    expect(migrations[8]?.sql).toContain('CREATE TABLE ballet_performance_completions');
    expect(migrations[8]?.sql).toContain('ballet_performance_completions_append_only');
    expect(migrations[9]).toMatchObject({ version: 10, name: 'catalog_collections_v2' });
    expect(migrations[9]?.sql).toContain('CREATE TABLE shop_collections');
    expect(migrations[9]?.sql).toContain('CREATE TABLE shop_item_collections');
    expect(migrations[9]?.sql).toContain('petal-practice-leotard');
    expect(migrations[10]).toMatchObject({ version: 11, name: 'wardrobe_presets' });
    expect(migrations[10]?.sql).toContain('CREATE TABLE wardrobe_presets');
    expect(migrations[10]?.sql).toContain('CREATE TABLE wardrobe_preset_equipment');
    expect(migrations[10]?.sql).toContain('CREATE TABLE wardrobe_preset_requests');
    expect(migrations[11]).toMatchObject({ version: 12, name: 'achievements_v1' });
    expect(migrations[11]?.sql).toContain('CREATE TABLE achievement_catalog');
    expect(migrations[11]?.sql).toContain('CREATE TABLE user_achievements');
    expect(migrations[11]?.sql).toContain('CREATE TABLE featured_user_achievements');
    expect(migrations[11]?.sql).toContain("('first-steps', 'First Steps'");
    expect(migrations[12]).toMatchObject({ version: 13, name: 'relationships_v1' });
    expect(migrations[12]?.sql).toContain('CREATE TABLE relationship_proposals');
    expect(migrations[12]?.sql).toContain('CREATE TABLE relationship_members');
    expect(migrations[13]).toMatchObject({
      version: 14,
      name: 'catalog_beauty_content_expansion',
    });
    expect(migrations[13]?.sql).toContain("'beauty'");
    expect(migrations[13]?.sql).toContain('prima-evening-pointe-shoes');
    expect(migrations[14]).toMatchObject({
      version: 15,
      name: 'moderation_case_persistence',
    });
    expect(migrations[14]?.sql).toContain('CREATE TABLE moderation_cases');
    expect(migrations[14]?.sql).toContain('moderation_cases_append_only');
    expect(migrations[14]?.sql).toContain('CREATE TABLE moderation_case_outcomes');
    expect(migrations[14]?.sql).toContain('moderation_case_outcomes_append_only');
    expect(migrations[15]).toMatchObject({
      version: 16,
      name: 'automod_rule_configuration',
    });
    expect(migrations[15]?.sql).toContain('CREATE TABLE automod_guild_rule_config');
    expect(migrations[15]?.sql).toContain('CREATE TABLE automod_guild_allowlist');
    expect(migrations[15]?.sql).toContain('request_payload jsonb NOT NULL');
    expect(migrations[15]?.sql).toContain('automod_config_requests_append_only');
    expect(migrations[16]).toMatchObject({
      version: 17,
      name: 'catalog_collection_membership_backfill',
    });
    expect(migrations[16]?.sql).toContain('ON CONFLICT (item_id, collection_id) DO NOTHING');
    expect(migrations[17]).toMatchObject({
      version: 18,
      name: 'ballet_academy_v1',
    });
    expect(migrations[17]?.sql).toContain('CREATE TABLE ballet_activity_stat_requirements');
    expect(migrations[17]?.sql).toContain("'prima-star'");
    expect(migrations[20]).toMatchObject({
      version: 21,
      name: 'academy_knowledge_v1',
    });
    expect(migrations[20]?.sql).toContain('CREATE TABLE academy_lesson_attempts');
    expect(migrations[20]?.sql).toContain('CREATE TABLE academy_lesson_completions');
    expect(migrations[20]?.sql).toContain('academy_lesson_completions_valid_attempt');
    expect(migrations[21]).toMatchObject({
      version: 22,
      name: 'ballet_classes_v1',
    });
    expect(migrations[21]?.sql).toContain('CREATE TABLE ballet_classes');
    expect(migrations[21]?.sql).toContain('CREATE TABLE ballet_class_attempts');
    expect(migrations[21]?.sql).toContain('CREATE TABLE academy_training_evidence');
    expect(migrations[21]?.sql).toContain('ballet_class_attempts_append_only');
    expect(migrations[22]).toMatchObject({
      version: 23,
      name: 'academy_assessments_v1',
    });
    expect(migrations[22]?.sql).toContain('CREATE TABLE academy_stage_progress');
    expect(migrations[22]?.sql).toContain('CREATE TABLE academy_assessment_attempts');
    expect(migrations[22]?.sql).toContain('CREATE TABLE academy_assessment_responses');
    expect(migrations[22]?.sql).toContain('CREATE TABLE academy_assessment_promotions');
    expect(migrations[22]?.sql).toContain('academy_assessment_one_active_per_user_idx');
    expect(migrations[22]?.sql).toContain('academy_assessment_attempts_no_delete');
    expect(migrations[22]?.sql).toContain('academy_stage_progress_no_delete');
    expect(migrations[22]?.sql).not.toMatch(/\bDROP\s+(TABLE|SCHEMA|DATABASE|TRUNCATE)\b/i);
    expect(migrations[6]?.sql).toContain('CREATE TABLE marketplace_sales');
    expect(migrations[6]?.sql).toContain('CREATE TABLE marketplace_requests');
    expect(migrations[6]?.sql).toContain('CREATE TRIGGER marketplace_escrow_no_truncate');
  });

  it('runs each pending migration in a transaction and releases the advisory lock', async () => {
    const statements: string[] = [];
    const query = vi.fn().mockImplementation(async (sql: string) => {
      statements.push(sql);
      return sql.includes('SELECT version, name, checksum') ? { rows: [] } : { rows: [] };
    });
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;

    await expect(runMigrations(pool, migrationsDirectory)).resolves.toEqual({
      appliedCount: 23,
      currentVersion: 23,
    });

    expect(statements).toContain('BEGIN');
    expect(statements).toContain('COMMIT');
    expect(statements.some((sql) => sql.includes('CREATE TABLE discord_users'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE wallet_ledger'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE daily_claims'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE ballet_progress'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE shop_catalog'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE user_inventory'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE shop_purchases'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE wardrobe_equipment'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE marketplace_listings'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE marketplace_escrow'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE marketplace_sales'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE ballet_stats'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE ballet_performance_catalog'))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.includes('CREATE TABLE shop_collections'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE shop_item_collections'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE wardrobe_presets'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE wardrobe_preset_equipment'))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.includes('CREATE TABLE wardrobe_preset_requests'))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.includes('CREATE TABLE achievement_catalog'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE user_achievements'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE featured_user_achievements'))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.includes('CREATE TABLE moderation_cases'))).toBe(true);
    expect(statements.some((sql) => sql.includes('CREATE TABLE moderation_case_outcomes'))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.includes('CREATE TABLE automod_guild_rule_config'))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.includes('CREATE TABLE automod_guild_allowlist'))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.includes('INSERT INTO shop_item_collections'))).toBe(true);
    expect(statements.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(statements.some((sql) => /\bDROP\s+(TABLE|SCHEMA|DATABASE|TRUNCATE)\b/i.test(sql))).toBe(
      false,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [1, 'initial_schema', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [2, 'ballet_slippers_wallet', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [3, 'daily_claims', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [4, 'ballet_progression', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [5, 'shop_catalog_and_inventory', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [6, 'wardrobe_equipment', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [7, 'marketplace_escrow', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [8, 'ballet_stats_and_activities', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [9, 'ballet_performances', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [10, 'catalog_collections_v2', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [11, 'wardrobe_presets', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [12, 'achievements_v1', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [13, 'relationships_v1', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [14, 'catalog_beauty_content_expansion', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [15, 'moderation_case_persistence', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [16, 'automod_rule_configuration', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [17, 'catalog_collection_membership_backfill', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [18, 'ballet_academy_v1', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('refuses a previously applied migration whose checksum changed', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT version, name, checksum')) {
        return { rows: [{ version: 1, name: 'initial_schema', checksum: '0'.repeat(64) }] };
      }

      return { rows: [] };
    });
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;

    await expect(runMigrations(pool, migrationsDirectory)).rejects.toThrow(
      'Applied SQL migration 1 was changed after release.',
    );
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE discord_users'));
    expect(client.release).toHaveBeenCalledOnce();
  });
});
