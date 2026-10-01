import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { withTransaction } from '../../src/database/transaction.js';

describe('withTransaction', () => {
  it('commits successful work and always releases its client', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;

    await expect(
      withTransaction(pool, async (transactionClient) => {
        await transactionClient.query('SELECT 1');
        return 'committed';
      }),
    ).resolves.toBe('committed');

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      'BEGIN',
      'SELECT 1',
      'COMMIT',
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back a failed operation and rethrows the original error', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const failure = new Error('operation failed');

    await expect(
      withTransaction(pool, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
