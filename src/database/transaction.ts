import type { Pool, PoolClient } from 'pg';

export type TransactionWork<T> = (client: PoolClient) => Promise<T>;

export async function withClientTransaction<T>(
  client: PoolClient,
  work: TransactionWork<T>,
): Promise<T> {
  await client.query('BEGIN');

  try {
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError(
        [error],
        'PostgreSQL transaction failed and rollback could not be completed.',
        { cause: rollbackError },
      );
    }

    throw error;
  }
}

export async function withTransaction<T>(pool: Pool, work: TransactionWork<T>): Promise<T> {
  const client = await pool.connect();

  try {
    return await withClientTransaction(client, work);
  } finally {
    client.release();
  }
}
