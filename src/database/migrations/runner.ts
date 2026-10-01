import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withClientTransaction } from '../transaction.js';

const migrationFilenamePattern = /^(\d{3})_([a-z0-9_]+)\.sql$/;
const migrationLockId = 8_107_202_601;

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly sql: string;
}

interface AppliedMigrationRow extends QueryResultRow {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

export interface MigrationResult {
  readonly appliedCount: number;
  readonly currentVersion: number;
}

export async function loadMigrations(directory: string): Promise<readonly Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'));
  const migrations: Migration[] = [];

  for (const file of sqlFiles) {
    const match = migrationFilenamePattern.exec(file.name);

    if (match === null || match[1] === undefined || match[2] === undefined) {
      throw new Error(`Invalid SQL migration filename: ${file.name}`);
    }

    const version = Number(match[1]);
    const name = match[2];
    const sql = (await readFile(resolve(directory, file.name), 'utf8')).trim();

    if (sql.length === 0) {
      throw new Error(`SQL migration ${file.name} is empty.`);
    }

    migrations.push({
      version,
      name,
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql,
    });
  }

  migrations.sort((left, right) => left.version - right.version);

  for (const [index, migration] of migrations.entries()) {
    if (migration.version !== index + 1) {
      throw new Error('SQL migration versions must be unique and contiguous starting at 001.');
    }
  }

  return migrations;
}

export async function runMigrations(
  pool: Pool,
  directory = resolve(process.cwd(), 'migrations'),
): Promise<MigrationResult> {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
    lockAcquired = true;
    await ensureMigrationTable(client);

    const rows = await readAppliedMigrations(client);
    const applied = new Map(rows.map((row) => [row.version, row]));
    const knownVersions = new Set(migrations.map((migration) => migration.version));

    for (const row of rows) {
      if (!knownVersions.has(row.version)) {
        throw new Error(`Applied SQL migration ${row.version} is missing from the project.`);
      }
    }

    let appliedCount = 0;

    for (const migration of migrations) {
      const previous = applied.get(migration.version);

      if (previous !== undefined) {
        if (previous.name !== migration.name || previous.checksum !== migration.checksum) {
          throw new Error(`Applied SQL migration ${migration.version} was changed after release.`);
        }

        continue;
      }

      await withClientTransaction(client, async (transactionClient) => {
        await transactionClient.query(migration.sql);
        await transactionClient.query(
          `INSERT INTO noelia_schema_migrations (version, name, checksum)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        );
      });

      appliedCount += 1;
    }

    return {
      appliedCount,
      currentVersion: migrations.at(-1)?.version ?? 0,
    };
  } finally {
    try {
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
      }
    } finally {
      client.release();
    }
  }
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS noelia_schema_migrations (
      version integer PRIMARY KEY CHECK (version > 0),
      name text NOT NULL,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function readAppliedMigrations(client: PoolClient): Promise<readonly AppliedMigrationRow[]> {
  const result = await client.query<AppliedMigrationRow>(
    `SELECT version, name, checksum
     FROM noelia_schema_migrations
     ORDER BY version`,
  );

  return result.rows;
}
