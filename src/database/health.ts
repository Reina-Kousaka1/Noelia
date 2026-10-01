import type { Pool } from 'pg';

export type DatabaseHealth =
  | { readonly status: 'healthy'; readonly latencyMs: number }
  | { readonly status: 'unhealthy'; readonly latencyMs: number; readonly reason: 'query_failed' };

export async function checkDatabaseHealth(pool: Pool): Promise<DatabaseHealth> {
  const startedAt = performance.now();

  try {
    await pool.query('SELECT 1');
    return {
      status: 'healthy',
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  } catch {
    return {
      status: 'unhealthy',
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      reason: 'query_failed',
    };
  }
}
