import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../database/transaction.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import { createModerationCaseDraft } from './case.js';
import type { CreateModerationCaseInput, ModerationAction } from './case.js';
import { ModerationIdempotencyConflictError, ModerationCaseIdError } from './moderation-errors.js';
import type {
  ModerationActionOutcome,
  ModerationCasePage,
  ModerationCaseRecord,
  ModerationOutcomeResult,
} from './moderation-types.js';

interface ModerationCaseRow extends QueryResultRow {
  readonly case_id: string;
  readonly guild_id: string;
  readonly target_user_id: string;
  readonly actor_user_id: string;
  readonly action: ModerationAction;
  readonly source: 'manual' | 'automod' | 'system';
  readonly reason: string | null;
  readonly occurred_at: Date;
  readonly expires_at: Date | null;
  readonly created_at: Date;
  readonly outcome: ModerationActionOutcome | null;
  readonly outcome_code: string | null;
  readonly outcome_recorded_at: Date | null;
}

interface CountRow extends QueryResultRow {
  readonly total_cases: string;
}

const PAGE_SIZE = 10;
const MAX_PAGE = 100_000;
const CASE_ID_PATTERN = /^[1-9][0-9]{0,18}$/;
const OUTCOME_CODE_PATTERN = /^[A-Za-z0-9_:-]{1,64}$/;

export interface ModerationCaseAttemptResult {
  readonly case: ModerationCaseRecord;
  readonly created: boolean;
}

export class ModerationService {
  public constructor(private readonly pool: Pool) {}

  /** Create the immutable case before any external Discord side effect. */
  public async createAttempt(
    input: CreateModerationCaseInput,
  ): Promise<ModerationCaseAttemptResult> {
    const draft = createModerationCaseDraft(input);
    const fingerprint = fingerprintDraft(draft);

    return withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO discord_users (discord_user_id)
         SELECT DISTINCT unnest($1::text[])
         ON CONFLICT (discord_user_id) DO NOTHING`,
        [[draft.actorUserId, draft.targetUserId]],
      );

      const inserted = await client.query<{ readonly case_id: string }>(
        `INSERT INTO moderation_cases (
           guild_id, target_user_id, actor_user_id, action, source, reason,
           occurred_at, expires_at, idempotency_key, request_fingerprint
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (guild_id, idempotency_key) DO NOTHING
         RETURNING case_id::text AS case_id`,
        [
          draft.guildId,
          draft.targetUserId,
          draft.actorUserId,
          draft.action,
          draft.source,
          draft.reason,
          draft.occurredAt,
          draft.expiresAt,
          draft.idempotencyKey,
          fingerprint,
        ],
      );
      const row = inserted.rows[0];
      const caseId = row?.case_id;

      if (caseId === undefined) {
        const existing = await client.query<ModerationCaseRow>(
          `SELECT cases.case_id::text AS case_id, cases.guild_id, cases.target_user_id,
                  cases.actor_user_id, cases.action, cases.source, cases.reason,
                  cases.occurred_at, cases.expires_at, cases.created_at,
                  outcomes.outcome, outcomes.outcome_code, outcomes.recorded_at AS outcome_recorded_at
           FROM moderation_cases AS cases
           LEFT JOIN moderation_case_outcomes AS outcomes USING (case_id)
           WHERE cases.guild_id = $1 AND cases.idempotency_key = $2`,
          [draft.guildId, draft.idempotencyKey],
        );
        const existingRow = existing.rows[0];

        if (existingRow === undefined) {
          throw new Error('Moderation idempotency conflict row disappeared inside transaction.');
        }
        if ((await findFingerprint(client, draft.guildId, draft.idempotencyKey)) !== fingerprint) {
          throw new ModerationIdempotencyConflictError();
        }
        return { case: mapCase(existingRow), created: false };
      }

      const result = await loadCaseById(client, draft.guildId, caseId);
      if (result === null) throw new Error('New moderation case could not be loaded.');
      return { case: result, created: true };
    });
  }

  /** Record the result once; retries with the same outcome are idempotent. */
  public async recordOutcome(
    caseId: string,
    outcome: ModerationActionOutcome,
    outcomeCode: string | null = null,
  ): Promise<ModerationOutcomeResult> {
    assertCaseId(caseId);
    if (outcome !== 'SUCCEEDED' && outcome !== 'FAILED' && outcome !== 'UNKNOWN') {
      throw new TypeError('Unsupported moderation outcome.');
    }
    if (outcomeCode !== null && !OUTCOME_CODE_PATTERN.test(outcomeCode)) {
      throw new TypeError('Moderation outcome code must be a short safe identifier.');
    }
    if (outcome === 'SUCCEEDED' && outcomeCode !== null) {
      throw new TypeError('Successful moderation outcomes cannot include an error code.');
    }

    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query(
        `INSERT INTO moderation_case_outcomes (case_id, outcome, outcome_code)
         VALUES ($1, $2, $3)
         ON CONFLICT (case_id) DO NOTHING
         RETURNING case_id`,
        [caseId, outcome, outcomeCode],
      );
      if (inserted.rowCount === 1) return { outcome, outcomeCode, replayed: false };

      const existing = await client.query<{
        readonly outcome: ModerationActionOutcome;
        readonly outcome_code: string | null;
      }>(
        `SELECT outcome, outcome_code
         FROM moderation_case_outcomes
         WHERE case_id = $1`,
        [caseId],
      );
      const existingOutcome = existing.rows[0];
      if (existingOutcome === undefined) {
        const caseExists = await client.query('SELECT 1 FROM moderation_cases WHERE case_id = $1', [
          caseId,
        ]);
        if (caseExists.rowCount === 0) throw new ModerationCaseIdError();
        throw new Error('Moderation outcome conflict row disappeared inside transaction.');
      }
      if (existingOutcome.outcome !== outcome || existingOutcome.outcome_code !== outcomeCode) {
        throw new ModerationIdempotencyConflictError();
      }
      return {
        outcome: existingOutcome.outcome,
        outcomeCode: existingOutcome.outcome_code,
        replayed: true,
      };
    });
  }

  public async getCase(guildId: string, caseId: string): Promise<ModerationCaseRecord | null> {
    assertDiscordSnowflake(guildId, 'guildId');
    assertCaseId(caseId);
    return loadCaseById(this.pool, guildId, caseId);
  }

  public async listCases(
    guildId: string,
    targetUserId: string,
    page: number,
    action?: ModerationAction,
  ): Promise<ModerationCasePage> {
    assertDiscordSnowflake(guildId, 'guildId');
    assertDiscordSnowflake(targetUserId, 'targetUserId');
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
      throw new RangeError(`Moderation case page must be an integer from 1 to ${MAX_PAGE}.`);
    }
    if (action !== undefined && !['note', 'warning', 'timeout', 'kick', 'ban'].includes(action)) {
      throw new TypeError('Unsupported moderation action filter.');
    }

    const offset = (page - 1) * PAGE_SIZE;
    const filter = action === undefined ? '' : 'AND cases.action = $3';
    const parameters =
      action === undefined
        ? [guildId, targetUserId, PAGE_SIZE, offset]
        : [guildId, targetUserId, action, PAGE_SIZE, offset];
    const limitIndex = action === undefined ? '$3' : '$4';
    const offsetIndex = action === undefined ? '$4' : '$5';

    const [count, result] = await Promise.all([
      this.pool.query<CountRow>(
        `SELECT count(*)::text AS total_cases
         FROM moderation_cases AS cases
         WHERE cases.guild_id = $1 AND cases.target_user_id = $2 ${filter}`,
        action === undefined ? [guildId, targetUserId] : [guildId, targetUserId, action],
      ),
      this.pool.query<ModerationCaseRow>(
        `SELECT cases.case_id::text AS case_id, cases.guild_id, cases.target_user_id,
                cases.actor_user_id, cases.action, cases.source, cases.reason,
                cases.occurred_at, cases.expires_at, cases.created_at,
                outcomes.outcome, outcomes.outcome_code, outcomes.recorded_at AS outcome_recorded_at
         FROM moderation_cases AS cases
         LEFT JOIN moderation_case_outcomes AS outcomes USING (case_id)
         WHERE cases.guild_id = $1 AND cases.target_user_id = $2 ${filter}
         ORDER BY cases.occurred_at DESC, cases.case_id DESC
         LIMIT ${limitIndex} OFFSET ${offsetIndex}`,
        parameters,
      ),
    ]);
    const totalCases = Number(count.rows[0]?.total_cases ?? '0');

    return {
      cases: result.rows.map(mapCase),
      page,
      pageSize: PAGE_SIZE,
      totalCases,
      totalPages: Math.ceil(totalCases / PAGE_SIZE),
    };
  }
}

function fingerprintDraft(draft: ReturnType<typeof createModerationCaseDraft>): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        draft.guildId,
        draft.targetUserId,
        draft.actorUserId,
        draft.action,
        draft.source,
        draft.reason,
        draft.occurredAt.toISOString(),
        draft.expiresAt?.toISOString() ?? null,
      ]),
    )
    .digest('hex');
}

async function findFingerprint(
  client: PoolClient,
  guildId: string,
  idempotencyKey: string,
): Promise<string | undefined> {
  const result = await client.query<{ readonly request_fingerprint: string }>(
    `SELECT request_fingerprint
     FROM moderation_cases
     WHERE guild_id = $1 AND idempotency_key = $2`,
    [guildId, idempotencyKey],
  );
  return result.rows[0]?.request_fingerprint;
}

async function loadCaseById(
  queryable: Pick<Pool, 'query'> | PoolClient,
  guildId: string,
  caseId: string,
): Promise<ModerationCaseRecord | null> {
  const result = await queryable.query<ModerationCaseRow>(
    `SELECT cases.case_id::text AS case_id, cases.guild_id, cases.target_user_id,
            cases.actor_user_id, cases.action, cases.source, cases.reason,
            cases.occurred_at, cases.expires_at, cases.created_at,
            outcomes.outcome, outcomes.outcome_code, outcomes.recorded_at AS outcome_recorded_at
     FROM moderation_cases AS cases
     LEFT JOIN moderation_case_outcomes AS outcomes USING (case_id)
     WHERE cases.guild_id = $1 AND cases.case_id = $2`,
    [guildId, caseId],
  );
  const row = result.rows[0];
  return row === undefined ? null : mapCase(row);
}

function mapCase(row: ModerationCaseRow): ModerationCaseRecord {
  return {
    caseId: row.case_id,
    guildId: row.guild_id,
    targetUserId: row.target_user_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    source: row.source,
    reason: row.reason,
    occurredAt: row.occurred_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    outcome: row.outcome,
    outcomeCode: row.outcome_code,
    outcomeRecordedAt: row.outcome_recorded_at,
  };
}

function assertCaseId(caseId: string): void {
  if (!CASE_ID_PATTERN.test(caseId) || BigInt(caseId) > 9_223_372_036_854_775_807n) {
    throw new ModerationCaseIdError();
  }
}
