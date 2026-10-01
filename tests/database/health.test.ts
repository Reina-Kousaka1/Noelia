import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { checkDatabaseHealth } from '../../src/database/health.js';

describe('checkDatabaseHealth', () => {
  it('reports a successful PostgreSQL probe without returning database details', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    } as unknown as Pool;

    await expect(checkDatabaseHealth(pool)).resolves.toMatchObject({ status: 'healthy' });
  });

  it('returns a safe unhealthy result if the probe fails', async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error('sensitive connection detail')),
    } as unknown as Pool;

    const result = await checkDatabaseHealth(pool);

    expect(result.status).toBe('unhealthy');
    expect(result).not.toHaveProperty('errorMessage');
  });
});
