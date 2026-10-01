import type { Pool, PoolClient } from 'pg';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { loadMigrations, runMigrations } from '../../src/database/migrations/runner.js';

const migrationsDirectory = resolve(process.cwd(), 'migrations');

describe('PostgreSQL migrations', () => {
  it('loads contiguous fresh migrations with SHA-256 checksums', async () => {
    const migrations = await loadMigrations(migrationsDirectory);

    expect(migrations).toHaveLength(7);
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
      appliedCount: 7,
      currentVersion: 7,
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
