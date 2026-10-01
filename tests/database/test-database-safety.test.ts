import { describe, expect, it } from 'vitest';

import { createIsolatedTestPool, UnsafeTestDatabaseError } from '../support/test-database.js';

describe('createIsolatedTestPool', () => {
  it('accepts only a named test database on loopback', async () => {
    const pool = createIsolatedTestPool({
      NODE_ENV: 'test',
      NOELIA_TEST_DATABASE_URL:
        'postgresql://tester:local-only-password@localhost:5432/noelia_test',
    });

    await pool.end();
  });

  it('rejects production mode without echoing the supplied URL', () => {
    const secretUrl = 'postgresql://user:do-not-print@localhost:5432/noelia_test';

    try {
      createIsolatedTestPool({ NODE_ENV: 'production', NOELIA_TEST_DATABASE_URL: secretUrl });
      expect.fail('Expected production test database access to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeTestDatabaseError);
      expect((error as Error).message).not.toContain(secretUrl);
      expect((error as Error).message).not.toContain('do-not-print');
    }
  });

  it.each([
    'postgresql://user:secret@db.example.com:5432/noelia_test',
    'postgresql://user:secret@localhost:5432/noelia',
  ])('rejects a remote or non-test database URL: %s', (connectionString) => {
    expect(() =>
      createIsolatedTestPool({ NODE_ENV: 'test', NOELIA_TEST_DATABASE_URL: connectionString }),
    ).toThrow(UnsafeTestDatabaseError);
  });
});
