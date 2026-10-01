import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { GAMEPLAY_CONFIG } from '../config/gameplay.js';
import { withTransaction } from '../database/transaction.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import { DailyCooldownError } from './daily-errors.js';
import { IdempotencyConflictError } from './errors.js';
import type { WalletCreditTransactionPort } from './ports.js';
import type { DailyClaimResult } from './types.js';

interface UserRow extends QueryResultRow {
  readonly discord_user_id: string;
}

interface CurrentTimeRow extends QueryResultRow {
  readonly current_time: Date;
}

interface ExistingDailyClaimRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly reward_amount: string;
  readonly request_fingerprint: string;
  readonly claimed_at: Date;
  readonly next_claim_at: Date;
  readonly balance_after: string;
}

interface LatestDailyClaimRow extends QueryResultRow {
  readonly claimed_at: Date;
  readonly next_claim_at: Date;
}

interface InsertedDailyClaimRow extends QueryResultRow {
  readonly claimed_at: Date;
  readonly next_claim_at: Date;
}

export class DailyService {
  public constructor(
    private readonly pool: Pool,
    private readonly wallet: WalletCreditTransactionPort,
  ) {}

  public async claimDaily(interactionId: string, discordUserId: string): Promise<DailyClaimResult> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');

    const requestFingerprint = createHash('sha256')
      .update(`${discordUserId}\u0000DAILY_REWARD`)
      .digest('hex');

    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUser(client, discordUserId);

      const existingClaim = await this.findClaimByInteraction(client, interactionId);

      if (existingClaim !== undefined) {
        if (
          existingClaim.discord_user_id !== discordUserId ||
          existingClaim.request_fingerprint !== requestFingerprint
        ) {
          throw new IdempotencyConflictError();
        }

        return {
          rewardAmount: BigInt(existingClaim.reward_amount),
          balance: BigInt(existingClaim.balance_after),
          claimedAt: existingClaim.claimed_at,
          nextClaimAt: existingClaim.next_claim_at,
          replayed: true,
        };
      }

      const latestClaim = await this.findLatestClaim(client, discordUserId);
      const currentTimeResult = await client.query<CurrentTimeRow>(
        'SELECT clock_timestamp() AS current_time',
      );
      const currentTime = currentTimeResult.rows[0]?.current_time;

      if (currentTime === undefined) {
        throw new Error('Database did not return the current time for a daily claim.');
      }

      if (
        latestClaim !== undefined &&
        currentTime.getTime() < latestClaim.next_claim_at.getTime()
      ) {
        throw new DailyCooldownError(latestClaim.next_claim_at);
      }

      const claimedAt = currentTime;
      const nextClaimAt = new Date(claimedAt.getTime() + GAMEPLAY_CONFIG.dailyCooldownMs);
      const walletMutation = await this.wallet.creditWithinTransaction(client, {
        interactionId,
        discordUserId,
        amount: GAMEPLAY_CONFIG.dailyRewardAmount,
        reason: 'DAILY_REWARD',
      });
      const insertedClaim = await client.query<InsertedDailyClaimRow>(
        `INSERT INTO daily_claims (
           interaction_id, discord_user_id, reward_amount, request_fingerprint,
           wallet_transaction_id, claimed_at, next_claim_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING claimed_at, next_claim_at`,
        [
          interactionId,
          discordUserId,
          GAMEPLAY_CONFIG.dailyRewardAmount.toString(),
          requestFingerprint,
          walletMutation.transactionId,
          claimedAt,
          nextClaimAt,
        ],
      );
      const claim = insertedClaim.rows[0];

      if (claim === undefined) {
        throw new Error('Daily claim was not recorded.');
      }

      return {
        rewardAmount: GAMEPLAY_CONFIG.dailyRewardAmount,
        balance: walletMutation.balance,
        claimedAt: claim.claimed_at,
        nextClaimAt: claim.next_claim_at,
        replayed: false,
      };
    });
  }

  private async ensureAndLockUser(client: PoolClient, discordUserId: string): Promise<void> {
    await client.query(
      `INSERT INTO discord_users (discord_user_id)
       VALUES ($1)
       ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
    const result = await client.query<UserRow>(
      `SELECT discord_user_id
       FROM discord_users
       WHERE discord_user_id = $1
       FOR UPDATE`,
      [discordUserId],
    );

    if (result.rows[0] === undefined) {
      throw new Error('Discord user row could not be locked for a daily claim.');
    }
  }

  private async findClaimByInteraction(
    client: PoolClient,
    interactionId: string,
  ): Promise<ExistingDailyClaimRow | undefined> {
    const result = await client.query<ExistingDailyClaimRow>(
      `SELECT daily.discord_user_id,
              daily.reward_amount,
              daily.request_fingerprint,
              daily.claimed_at,
              daily.next_claim_at,
              ledger.balance_after
       FROM daily_claims AS daily
       INNER JOIN wallet_ledger AS ledger
         ON ledger.transaction_id = daily.wallet_transaction_id
        AND ledger.discord_user_id = daily.discord_user_id
       WHERE daily.interaction_id = $1`,
      [interactionId],
    );

    return result.rows[0];
  }

  private async findLatestClaim(
    client: PoolClient,
    discordUserId: string,
  ): Promise<LatestDailyClaimRow | undefined> {
    const result = await client.query<LatestDailyClaimRow>(
      `SELECT claimed_at, next_claim_at
       FROM daily_claims
       WHERE discord_user_id = $1
       ORDER BY claimed_at DESC, interaction_id DESC
       LIMIT 1`,
      [discordUserId],
    );

    return result.rows[0];
  }
}
