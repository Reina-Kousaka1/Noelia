import { loadEnvironmentConfig } from './config/environment.js';
import { createDiscordRuntime } from './bot/runtime.js';
import { NOELIA_NAME } from './identity.js';
import { createLogger } from './infrastructure/logging/logger.js';

async function main(): Promise<void> {
  let logger = createLogger();

  try {
    const config = loadEnvironmentConfig();
    logger = createLogger([config.discord.token, config.postgres.password]);
    logger.info('application.starting', {
      name: NOELIA_NAME,
      nodeEnvironment: config.nodeEnvironment,
    });

    const runtime = createDiscordRuntime(config, logger);
    let shutdownRequested = false;

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (shutdownRequested) {
        return;
      }

      shutdownRequested = true;
      logger.info('application.shutdown_requested', { signal });

      try {
        await runtime.stop();
      } catch (error) {
        process.exitCode = 1;
        logger.error('application.shutdown_failed', error);
      }
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
  }
}

void main();
