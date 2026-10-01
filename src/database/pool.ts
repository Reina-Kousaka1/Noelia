import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

import type { AppConfig } from '../config/environment.js';
import type { StructuredLogger } from '../infrastructure/logging/logger.js';

export function createPostgresPool(config: AppConfig['postgres'], logger: StructuredLogger): Pool {
  const options: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    application_name: 'noelia',
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
  const pool = new Pool(options);

  pool.on('error', (error: Error) => {
    logger.error('database.idle_client_error', error, { provider: 'postgresql' });
  });

  return pool;
}
