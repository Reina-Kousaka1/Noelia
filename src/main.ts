import type { Pool } from 'pg';
import { ShutdownController } from './infrastructure/shutdown.js';

import { createDiscordRuntime } from './bot/runtime.js';
import { loadEnvironmentConfig } from './config/environment.js';
import { checkDatabaseHealth } from './database/health.js';
import { runMigrations } from './database/migrations/runner.js';
import { createPostgresPool } from './database/pool.js';
import { NOELIA_NAME } from './identity.js';
import { createLogger } from './infrastructure/logging/logger.js';

async function main(): Promise<void> {
  let logger = createLogger();
  let pool: Pool | undefined;
  let shutdown: ShutdownController | undefined;
  let runtime: ReturnType<typeof createDiscordRuntime> | undefined;

  try {
    const config = loadEnvironmentConfig();
    logger = createLogger([
      config.discord.token,
      config.postgres.password,
      ...(config.persona.apiKey === undefined ? [] : [config.persona.apiKey]),
    ]);
    logger.info('application.starting', {
      name: NOELIA_NAME,
      nodeEnvironment: config.nodeEnvironment,
    });

    shutdown = new ShutdownController(
      async () => {
        await runtime?.stop();
      },
      async () => {
        await pool?.end();
      },
      logger,
      (code) => process.exit(code),
    );
    process.once('SIGINT', () => {
      void shutdown?.request('SIGINT');
    });
    process.once('SIGTERM', () => {
      void shutdown?.request('SIGTERM');
    });

    pool = createPostgresPool(config.postgres, logger);
    const migrations = await runMigrations(pool);
    logger.info('database.migrations_ready', {
      appliedCount: migrations.appliedCount,
      currentVersion: migrations.currentVersion,
      provider: 'postgresql',
    });

    const databaseHealth = await checkDatabaseHealth(pool);

    if (databaseHealth.status !== 'healthy') {
      throw new Error('PostgreSQL health check failed.');
    }

    logger.info('database.ready', {
      latencyMs: databaseHealth.latencyMs,
      provider: 'postgresql',
    });

    runtime = createDiscordRuntime(config, logger, pool, () => {
      void shutdown?.request('discord_recovery');
    });

    await runtime.start();
  } catch (error) {
    if (shutdown?.stopping) return;
    logger.error('application.startup_failed', error);
    if (shutdown !== undefined) await shutdown.request('startup_failure');
    else process.exitCode = 1;
  }
}

void main();
