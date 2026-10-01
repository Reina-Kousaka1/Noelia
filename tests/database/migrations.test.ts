import type { Pool, PoolClient } from 'pg';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { loadMigrations, runMigrations } from '../../src/database/migrations/runner.js';

const migrationsDirectory = resolve(process.cwd(), 'migrations');

describe('PostgreSQL migrations', () => {
  it('loads the new V1 schema with a SHA-256 checksum', async () => {
    const migrations = await loadMigrations(migrationsDirectory);

    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toMatchObject({
      version: 1,
      name: 'initial_schema',
    });
    expect(migrations[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migrations[0]?.sql).toContain('CREATE TABLE discord_users');
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
      appliedCount: 1,
      currentVersion: 1,
    });

    expect(statements).toContain('BEGIN');
    expect(statements).toContain('COMMIT');
    expect(statements.some((sql) => sql.includes('CREATE TABLE discord_users'))).toBe(true);
    expect(statements.some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(statements.some((sql) => sql.includes('DROP '))).toBe(false);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO noelia_schema_migrations'),
      [1, 'initial_schema', expect.stringMatching(/^[a-f0-9]{64}$/)],
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
