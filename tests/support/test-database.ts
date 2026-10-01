import { Pool } from 'pg';

const allowedLocalHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class UnsafeTestDatabaseError extends Error {
  public constructor(reason: string) {
    super(`Unsafe PostgreSQL integration-test configuration: ${reason}`);
    this.name = 'UnsafeTestDatabaseError';
  }
}

export function createIsolatedTestPool(environment: NodeJS.ProcessEnv): Pool {
  if (environment.NODE_ENV !== 'test') {
    throw new UnsafeTestDatabaseError('NODE_ENV must equal "test".');
  }

  const connectionString = environment.NOELIA_TEST_DATABASE_URL;

  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new UnsafeTestDatabaseError('NOELIA_TEST_DATABASE_URL is required.');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(connectionString);
  } catch {
    throw new UnsafeTestDatabaseError('the test database URL is invalid.');
  }

  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    throw new UnsafeTestDatabaseError('the URL must use the PostgreSQL protocol.');
  }

  if (!allowedLocalHosts.has(parsedUrl.hostname.toLowerCase())) {
    throw new UnsafeTestDatabaseError('integration tests may connect only to loopback hosts.');
  }

  let databaseName: string;

  try {
    databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  } catch {
    throw new UnsafeTestDatabaseError('the database name is invalid.');
  }

  if (databaseName !== 'noelia_test') {
    throw new UnsafeTestDatabaseError('the database name must be exactly "noelia_test".');
  }

  return new Pool({
    connectionString,
    application_name: 'noelia-integration-tests',
    max: 2,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });
}
