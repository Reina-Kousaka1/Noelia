import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresDiscordUserRepository } from '../../src/database/discord-user.repository.js';
import { runMigrations } from '../../src/database/migrations/runner.js';
import { withClientTransaction } from '../../src/database/transaction.js';
import { createIsolatedTestPool } from '../support/test-database.js';

const integrationDescribe = process.env.NOELIA_TEST_DATABASE_URL ? describe : describe.skip;

integrationDescribe('isolated PostgreSQL integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIsolatedTestPool(process.env);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('applies migrations idempotently and persists Discord user identity', async () => {
    const migrationResult = await runMigrations(pool);
    const repository = new PostgresDiscordUserRepository(pool);
    const discordUserId = '987654321098765432';
    const first = await repository.findOrCreate(discordUserId);
    const second = await repository.findOrCreate(discordUserId);

    expect(migrationResult).toEqual({ appliedCount: 0, currentVersion: 1 });
    expect(first.discordUserId).toBe(discordUserId);
    expect(second).toEqual(first);
  });

  it('rolls back PostgreSQL work on the same checked-out client', async () => {
    const client = await pool.connect();
    const failure = new Error('expected rollback');

    try {
      await expect(
        withClientTransaction(client, async (transactionClient) => {
          await transactionClient.query('CREATE TEMP TABLE noelia_rollback_probe (id integer)');
          throw failure;
        }),
      ).rejects.toBe(failure);

      const result = await client.query<{ exists: boolean }>(
        "SELECT to_regclass('pg_temp.noelia_rollback_probe') IS NOT NULL AS exists",
      );
      expect(result.rows[0]?.exists).toBe(false);
    } finally {
      client.release();
    }
  });
});
