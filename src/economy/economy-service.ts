import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../database/transaction.js';
import {
  IdempotencyConflictError,
  InsufficientBalletSlippersError,
  WalletBalanceLimitError,
} from './errors.js';
import type {
  WalletCreditReason,
  WalletEntryType,
  WalletLedgerEntry,
  WalletMutationResult,
  WalletSpendReason,
} from './types.js';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const discordSnowflakePattern = /^\d{17,20}$/;

interface IdRow extends QueryResultRow {
  readonly id: string;
}

interface ExistingTransactionRow extends QueryResultRow {
  readonly id: string;
  readonly operation_type: WalletEntryType;
  readonly request_fingerprint: string;
}

interface BalanceRow extends QueryResultRow {
  readonly balance: string;
}

interface ExistingLedgerRow extends QueryResultRow {
  readonly balance_after: string;
}

interface LedgerRow extends QueryResultRow {
  readonly transaction_id: string;
  readonly entry_type: WalletEntryType;
  readonly amount_delta: string;
  readonly balance_after: string;
  readonly created_at: Date;
}

export interface WalletMutationInput {
  readonly interactionId: string;
  readonly discordUserId: string;
  readonly amount: bigint;
}

export interface WalletAdjustmentInput {
  readonly interactionId: string;
  readonly discordUserId: string;
  readonly delta: bigint;
}

export class EconomyService {
  public constructor(private readonly pool: Pool) {}

  public async getBalance(discordUserId: string): Promise<bigint> {
    this.validateDiscordId(discordUserId, 'Discord user ID');
    const result = await this.pool.query<BalanceRow>(
      `SELECT balance
       FROM ballet_slippers_wallets
       WHERE discord_user_id = $1`,
      [discordUserId],
    );

    return result.rows[0] === undefined ? 0n : BigInt(result.rows[0].balance);
  }

  public async getLedger(discordUserId: string, limit = 20): Promise<readonly WalletLedgerEntry[]> {
    this.validateDiscordId(discordUserId, 'Discord user ID');

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('Ledger page size must be an integer from 1 to 100.');
    }

    const result = await this.pool.query<LedgerRow>(
      `SELECT wallet_txn.id AS transaction_id,
              wallet_txn.operation_type AS entry_type,
              ledger.amount_delta,
              ledger.balance_after,
              ledger.created_at
       FROM wallet_ledger AS ledger
       INNER JOIN wallet_transactions AS wallet_txn
         ON wallet_txn.id = ledger.transaction_id
       WHERE ledger.discord_user_id = $1
       ORDER BY ledger.created_at DESC, ledger.transaction_id DESC
       LIMIT $2`,
      [discordUserId, limit],
    );

    return result.rows.map((row) => ({
      transactionId: row.transaction_id,
      entryType: row.entry_type,
      amountDelta: BigInt(row.amount_delta),
      balanceAfter: BigInt(row.balance_after),
      createdAt: row.created_at,
    }));
  }

  public credit(
    input: WalletMutationInput & { readonly reason: WalletCreditReason },
  ): Promise<WalletMutationResult> {
    this.validateAmount(input.amount);
    return withTransaction(this.pool, (client) => this.creditWithinTransaction(client, input));
  }

  public creditWithinTransaction(
    client: PoolClient,
    input: WalletMutationInput & { readonly reason: WalletCreditReason },
  ): Promise<WalletMutationResult> {
    this.validateAmount(input.amount);
    return this.applyMutation(client, input, input.reason, input.amount);
  }

  public spend(
    input: WalletMutationInput & { readonly reason: WalletSpendReason },
  ): Promise<WalletMutationResult> {
    this.validateAmount(input.amount);
    return withTransaction(this.pool, (client) => this.spendWithinTransaction(client, input));
  }

  public spendWithinTransaction(
    client: PoolClient,
    input: WalletMutationInput & { readonly reason: WalletSpendReason },
  ): Promise<WalletMutationResult> {
    this.validateAmount(input.amount);
    return this.applyMutation(client, input, input.reason, -input.amount);
  }

  public adjust(input: WalletAdjustmentInput): Promise<WalletMutationResult> {
    if (input.delta === 0n) {
      throw new RangeError('Wallet adjustment must not be zero.');
    }

    this.validateAmount(input.delta < 0n ? -input.delta : input.delta);
    return withTransaction(this.pool, (client) => this.adjustWithinTransaction(client, input));
  }

  public adjustWithinTransaction(
    client: PoolClient,
    input: WalletAdjustmentInput,
  ): Promise<WalletMutationResult> {
    if (input.delta === 0n) {
      throw new RangeError('Wallet adjustment must not be zero.');
    }

    this.validateAmount(input.delta < 0n ? -input.delta : input.delta);
    return this.applyMutation(client, input, 'ADMIN_ADJUSTMENT', input.delta);
  }

  private async applyMutation(
    client: PoolClient,
    input: WalletMutationInput | WalletAdjustmentInput,
    entryType: WalletEntryType,
    amountDelta: bigint,
  ): Promise<WalletMutationResult> {
    this.validateDiscordId(input.discordUserId, 'Discord user ID');
    this.validateDiscordId(input.interactionId, 'Discord interaction ID');
    const requestFingerprint = createHash('sha256')
      .update(`${input.discordUserId}\u0000${entryType}\u0000${amountDelta.toString()}`)
      .digest('hex');

    await this.ensureDiscordUser(client, input.discordUserId);

    const transactionInsert = await client.query<IdRow>(
      `INSERT INTO wallet_transactions (idempotency_key, operation_type, request_fingerprint)
         VALUES ($1, $2, $3)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
      [input.interactionId, entryType, requestFingerprint],
    );
    const insertedTransaction = transactionInsert.rows[0];

    if (insertedTransaction === undefined) {
      return this.readIdempotentResult(client, input, entryType, requestFingerprint);
    }

    await client.query(
      `INSERT INTO ballet_slippers_wallets (discord_user_id)
         VALUES ($1)
         ON CONFLICT (discord_user_id) DO NOTHING`,
      [input.discordUserId],
    );

    const walletResult = await client.query<BalanceRow>(
      `SELECT balance
         FROM ballet_slippers_wallets
         WHERE discord_user_id = $1
         FOR UPDATE`,
      [input.discordUserId],
    );
    const wallet = walletResult.rows[0];

    if (wallet === undefined) {
      throw new Error('Wallet row could not be locked after insert.');
    }

    const currentBalance = BigInt(wallet.balance);
    const nextBalance = currentBalance + amountDelta;

    if (nextBalance < 0n) {
      throw new InsufficientBalletSlippersError(currentBalance, -amountDelta);
    }

    if (nextBalance > MAX_POSTGRES_BIGINT) {
      throw new WalletBalanceLimitError();
    }

    await client.query(
      `UPDATE ballet_slippers_wallets
         SET balance = $2, updated_at = now()
         WHERE discord_user_id = $1`,
      [input.discordUserId, nextBalance.toString()],
    );
    await client.query(
      `INSERT INTO wallet_ledger (
           transaction_id, discord_user_id, amount_delta, balance_after
         ) VALUES ($1, $2, $3, $4)`,
      [insertedTransaction.id, input.discordUserId, amountDelta.toString(), nextBalance.toString()],
    );

    return {
      balance: nextBalance,
      transactionId: insertedTransaction.id,
      replayed: false,
    };
  }

  private async readIdempotentResult(
    client: PoolClient,
    input: WalletMutationInput | WalletAdjustmentInput,
    entryType: WalletEntryType,
    requestFingerprint: string,
  ): Promise<WalletMutationResult> {
    const transactionResult = await client.query<ExistingTransactionRow>(
      `SELECT id, operation_type, request_fingerprint
       FROM wallet_transactions
       WHERE idempotency_key = $1`,
      [input.interactionId],
    );
    const existingTransaction = transactionResult.rows[0];

    if (existingTransaction === undefined) {
      throw new Error('Wallet idempotency record could not be loaded.');
    }

    if (
      existingTransaction.operation_type !== entryType ||
      existingTransaction.request_fingerprint !== requestFingerprint
    ) {
      throw new IdempotencyConflictError();
    }

    const ledgerResult = await client.query<ExistingLedgerRow>(
      `SELECT balance_after
       FROM wallet_ledger
       WHERE transaction_id = $1 AND discord_user_id = $2`,
      [existingTransaction.id, input.discordUserId],
    );
    const ledgerEntry = ledgerResult.rows[0];

    if (ledgerEntry === undefined) {
      throw new Error('Wallet idempotency record has no matching ledger entry.');
    }

    return {
      balance: BigInt(ledgerEntry.balance_after),
      transactionId: existingTransaction.id,
      replayed: true,
    };
  }

  private async ensureDiscordUser(client: PoolClient, discordUserId: string): Promise<void> {
    await client.query(
      `INSERT INTO discord_users (discord_user_id)
       VALUES ($1)
       ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
  }

  private validateDiscordId(value: string, name: string): void {
    if (!discordSnowflakePattern.test(value)) {
      throw new TypeError(`${name} must be a 17- to 20-digit numeric ID.`);
    }
  }

  private validateAmount(amount: bigint): void {
    if (typeof amount !== 'bigint' || amount <= 0n) {
      throw new RangeError('Wallet change amount must be a positive integer.');
    }

    if (amount > MAX_POSTGRES_BIGINT) {
      throw new WalletBalanceLimitError();
    }
  }
}
