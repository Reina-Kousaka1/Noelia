import type { Pool } from 'pg';

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
  let shutdownPromise: Promise<void> | undefined;
  let runtime: ReturnType<typeof createDiscordRuntime> | undefined;

  try {
    const config = loadEnvironmentConfig();
    logger = createLogger([config.discord.token, config.postgres.password]);
    logger.info('application.starting', {
      name: NOELIA_NAME,
      nodeEnvironment: config.nodeEnvironment,
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

    runtime = createDiscordRuntime(config, logger);

    const shutdown = (signal?: NodeJS.Signals): Promise<void> => {
      if (shutdownPromise !== undefined) {
        return shutdownPromise;
      }

      if (signal !== undefined) {
        logger.info('application.shutdown_requested', { signal });
      }

      shutdownPromise = (async () => {
        if (runtime !== undefined) {
          try {
            await runtime.stop();
          } catch (error) {
            process.exitCode = 1;
            logger.error('application.discord_shutdown_failed', error);
          }
        }

        if (pool !== undefined) {
          try {
            await pool.end();
            pool = undefined;
          } catch (error) {
            process.exitCode = 1;
            logger.error('application.database_shutdown_failed', error);
          }
        }

        logger.info('application.stopped');
      })();

      return shutdownPromise;
    };

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    await runtime.start();
  } catch (error) {
    process.exitCode = 1;
    logger.error('application.startup_failed', error);

    if (shutdownPromise === undefined) {
      if (runtime !== undefined) {
        try {
          await runtime.stop();
        } catch (shutdownError) {
          logger.error('application.discord_shutdown_failed', shutdownError);
        }
      }

      if (pool !== undefined) {
        try {
          await pool.end();
        } catch (shutdownError) {
          logger.error('application.database_shutdown_failed', shutdownError);
        }
      }
    }
  }
}

void main();
