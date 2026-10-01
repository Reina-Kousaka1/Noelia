import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { EconomyService } from '../../src/economy/economy-service.js';
import {
  IdempotencyConflictError,
  InsufficientBalletSlippersError,
} from '../../src/economy/errors.js';

interface StoredTransaction {
  readonly id: string;
  readonly operationType: string;
  readonly fingerprint: string;
}

interface StoredLedgerEntry {
  readonly transactionId: string;
  readonly discordUserId: string;
  readonly amountDelta: bigint;
  readonly balanceAfter: bigint;
  readonly createdAt: Date;
}

function createWalletDatabase(initialBalance = 0n) {
  const wallets = new Map<string, bigint>();
  const transactions = new Map<string, StoredTransaction>();
  const ledger: StoredLedgerEntry[] = [];
  const statements: string[] = [];
  let nextTransactionId = 1;

  if (initialBalance > 0n) {
    wallets.set('222222222222222222', initialBalance);
  }

  const query = vi.fn(async (rawSql: string, values: unknown[] = []) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    statements.push(sql);

    if (sql.startsWith('INSERT INTO wallet_transactions')) {
      const idempotencyKey = String(values[0]);
      if (transactions.has(idempotencyKey)) {
        return { rows: [] };
      }

      const transaction: StoredTransaction = {
        id: String(nextTransactionId++),
        operationType: String(values[1]),
        fingerprint: String(values[2]),
      };
      transactions.set(idempotencyKey, transaction);
      return { rows: [{ id: transaction.id }] };
    }

    if (sql.startsWith('SELECT id, operation_type, request_fingerprint')) {
      const transaction = transactions.get(String(values[0]));
      return {
        rows:
          transaction === undefined
            ? []
            : [
                {
                  id: transaction.id,
                  operation_type: transaction.operationType,
                  request_fingerprint: transaction.fingerprint,
                },
              ],
      };
    }

    if (sql.startsWith('SELECT balance_after FROM wallet_ledger')) {
      const entry = ledger.find(
        (candidate) =>
          candidate.transactionId === String(values[0]) &&
          candidate.discordUserId === String(values[1]),
      );
      return {
        rows: entry === undefined ? [] : [{ balance_after: entry.balanceAfter.toString() }],
      };
    }

    if (sql.startsWith('INSERT INTO ballet_slippers_wallets')) {
      const discordUserId = String(values[0]);
      if (!wallets.has(discordUserId)) {
        wallets.set(discordUserId, 0n);
      }
      return { rows: [] };
    }

    if (sql.startsWith('SELECT balance FROM ballet_slippers_wallets')) {
      const balance = wallets.get(String(values[0]));
      return { rows: balance === undefined ? [] : [{ balance: balance.toString() }] };
    }

    if (sql.startsWith('UPDATE ballet_slippers_wallets')) {
      wallets.set(String(values[0]), BigInt(String(values[1])));
      return { rows: [] };
    }

    if (sql.startsWith('INSERT INTO wallet_ledger')) {
      ledger.push({
        transactionId: String(values[0]),
        discordUserId: String(values[1]),
        amountDelta: BigInt(String(values[2])),
        balanceAfter: BigInt(String(values[3])),
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      });
      return { rows: [] };
    }

    if (sql.startsWith('SELECT wallet_txn.id AS transaction_id')) {
      const userEntries = ledger
        .filter((entry) => entry.discordUserId === String(values[0]))
        .slice(0, Number(values[1]));
      return {
        rows: userEntries.map((entry) => ({
          transaction_id: entry.transactionId,
          entry_type: [...transactions.values()].find((item) => item.id === entry.transactionId)
            ?.operationType,
          amount_delta: entry.amountDelta.toString(),
          balance_after: entry.balanceAfter.toString(),
          created_at: entry.createdAt,
        })),
      };
    }

    if (
      sql === 'BEGIN' ||
      sql === 'COMMIT' ||
      sql === 'ROLLBACK' ||
      sql.startsWith('INSERT INTO discord_users')
    ) {
      return { rows: [] };
    }

    throw new Error(`Unexpected test SQL: ${sql}`);
  });

  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = {
    query,
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn(),
  } as unknown as Pool;

  return { service: new EconomyService(pool), query, statements, wallets, ledger };
}

describe('EconomyService', () => {
  it('returns zero for a new wallet and validates Discord IDs', async () => {
    const database = createWalletDatabase();

    await expect(database.service.getBalance('222222222222222222')).resolves.toBe(0n);
    await expect(database.service.getBalance('not-a-snowflake')).rejects.toThrow(TypeError);
    expect(database.query).toHaveBeenCalledOnce();
  });

  it('credits Ballet Slippers and writes a matching ledger entry transactionally', async () => {
    const database = createWalletDatabase();

    await expect(
      database.service.credit({
        interactionId: '111111111111111111',
        discordUserId: '222222222222222222',
        amount: 1_240n,
        reason: 'DAILY_REWARD',
      }),
    ).resolves.toEqual({ balance: 1_240n, transactionId: '1', replayed: false });

    expect(database.wallets.get('222222222222222222')).toBe(1_240n);
    expect(database.ledger).toHaveLength(1);
    expect(database.ledger[0]).toMatchObject({ amountDelta: 1_240n, balanceAfter: 1_240n });
    expect(database.statements).toContain('BEGIN');
    expect(database.statements).toContain('COMMIT');
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ballet_slippers_wallets'),
      ['222222222222222222', '1240'],
    );
    await expect(database.service.getLedger('222222222222222222')).resolves.toMatchObject([
      {
        transactionId: '1',
        entryType: 'DAILY_REWARD',
        amountDelta: 1_240n,
        balanceAfter: 1_240n,
      },
    ]);
  });

  it('replays the same interaction without duplicating wallet or ledger mutations', async () => {
    const database = createWalletDatabase();
    const input = {
      interactionId: '111111111111111111',
      discordUserId: '222222222222222222',
      amount: 75n,
      reason: 'BALLET_ACTIVITY' as const,
    };

    await database.service.credit(input);
    const replay = await database.service.credit(input);

    expect(replay).toEqual({ balance: 75n, transactionId: '1', replayed: true });
    expect(database.wallets.get('222222222222222222')).toBe(75n);
    expect(database.ledger).toHaveLength(1);
  });

  it('rejects reuse of an interaction ID for a different wallet mutation', async () => {
    const database = createWalletDatabase();
    const firstInput = {
      interactionId: '111111111111111111',
      discordUserId: '222222222222222222',
      amount: 75n,
      reason: 'BALLET_ACTIVITY' as const,
    };
    await database.service.credit(firstInput);

    await expect(database.service.credit({ ...firstInput, amount: 80n })).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
    expect(database.wallets.get('222222222222222222')).toBe(75n);
    expect(database.ledger).toHaveLength(1);
    expect(database.statements).toContain('ROLLBACK');
  });

  it('rolls back an unaffordable spend without changing the wallet or ledger', async () => {
    const database = createWalletDatabase(5n);

    await expect(
      database.service.spend({
        interactionId: '111111111111111111',
        discordUserId: '222222222222222222',
        amount: 6n,
        reason: 'SHOP_PURCHASE',
      }),
    ).rejects.toBeInstanceOf(InsufficientBalletSlippersError);

    expect(database.wallets.get('222222222222222222')).toBe(5n);
    expect(database.ledger).toHaveLength(0);
    expect(database.statements).toContain('ROLLBACK');
    expect(
      database.statements.some((sql) => sql.startsWith('UPDATE ballet_slippers_wallets')),
    ).toBe(false);
  });

  it('rejects zero, non-integer amounts, and ledger page sizes outside the supported range', async () => {
    const database = createWalletDatabase();

    expect(() =>
      database.service.credit({
        interactionId: '111111111111111111',
        discordUserId: '222222222222222222',
        amount: 0n,
        reason: 'DAILY_REWARD',
      }),
    ).toThrow(RangeError);
    expect(() =>
      database.service.credit({
        interactionId: '111111111111111111',
        discordUserId: '222222222222222222',
        amount: 1.5 as unknown as bigint,
        reason: 'DAILY_REWARD',
      }),
    ).toThrow(RangeError);
    await expect(database.service.getLedger('222222222222222222', 101)).rejects.toThrow(RangeError);
    expect(database.query).not.toHaveBeenCalled();
  });
});
