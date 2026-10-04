import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { assertDiscordSnowflake } from '../../utils/discord-snowflake.js';
import { withTransaction } from '../../database/transaction.js';
import { IdempotencyConflictError } from '../../economy/errors.js';
import type { BalletExerciseOutcome } from '../class/types.js';
import {
  BALLET_TRAINING_V3_RULES,
  applyExerciseCondition,
  applyRecoveryAction,
  conditionScoreModifier,
  createInitialCondition,
  createInitialTrainingSkills,
  nextStaminaCycle,
  recoverConditionOverTime,
  shouldCreateTrainingSetback,
  skillValuesAfterAttempt,
  validateShoeFitProfile,
} from './rules.js';
import {
  BalletRehabilitationUnavailableError,
  BalletTrainingActionReplayConflictError,
  BalletTrainingCooldownError,
} from './errors.js';
import { BALLET_RECOVERY_ACTIONS, BALLET_TRAINING_SKILLS } from './types.js';
import type {
  BalletConditionSnapshot,
  BalletRecoveryAction,
  BalletRecoveryResult,
  BalletShoeFitProfile,
  BalletStaminaCycleSnapshot,
  BalletTrainingMutationResult,
  BalletTrainingSetbackSnapshot,
  BalletTrainingSkill,
  BalletTrainingSkillValues,
  BalletTrainingV3Snapshot,
} from './types.js';

interface ConditionRow extends QueryResultRow {
  readonly energy: number;
  readonly nutrition: number;
  readonly fatigue: number;
  readonly sleep_debt: number;
  readonly updated_at: Date;
}

interface SkillRow extends QueryResultRow {
  readonly skill_key: string;
  readonly skill_value: number;
}

interface CycleRow extends QueryResultRow {
  readonly cycle_number: number;
  readonly target_workload: number;
  readonly completed_workload: number;
  readonly status: string;
  readonly started_at: Date;
  readonly deadline_at: Date;
  readonly completed_at: Date | null;
  readonly below_floor_exception: boolean;
}

interface SetbackRow extends QueryResultRow {
  readonly kind: string;
  readonly status: string;
  readonly required_rehab_sessions: number;
  readonly completed_rehab_sessions: number;
  readonly started_at: Date;
  readonly recovered_at: Date | null;
}

interface FitRow extends QueryResultRow {
  readonly game_shoe_size_eu: string;
  readonly game_fit: string;
  readonly updated_at: Date;
}

interface ActionRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly action_type: string;
  readonly request_fingerprint: string;
  readonly result_snapshot: unknown;
}

interface ClockRow extends QueryResultRow {
  readonly now: Date;
}

type BalletTrainingClock = (client: PoolClient) => Promise<Date>;

export interface BalletTrainingAttemptContext {
  readonly skills: BalletTrainingSkillValues;
  readonly condition: BalletConditionSnapshot;
  readonly performanceModifier: number;
  readonly capturedAt: Date;
}

export interface BalletTrainingAttemptInput {
  readonly interactionId: string;
  readonly discordUserId: string;
  readonly attemptId: string;
  readonly outcome: BalletExerciseOutcome;
  readonly family: string;
  readonly difficulty: number;
  readonly context: BalletTrainingAttemptContext;
  readonly setbackRoll: number;
}

/**
 * Additive V3 state owner. Existing six Ballet stats, XP, wallet and Academy
 * progress remain owned by their existing domains.
 */
export class BalletTrainingV3Service {
  public constructor(
    private readonly pool: Pool,
    private readonly random: () => number = Math.random,
    private readonly clock: BalletTrainingClock = getDatabaseTime,
  ) {}

  public async getSnapshot(discordUserId: string): Promise<BalletTrainingV3Snapshot> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    return withTransaction(this.pool, async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const now = await this.getCurrentTime(client);
      return loadSnapshot(client, discordUserId, now);
    });
  }

  public async recover(
    interactionId: string,
    discordUserId: string,
    action: BalletRecoveryAction,
  ): Promise<BalletRecoveryResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    if (!(BALLET_RECOVERY_ACTIONS as readonly string[]).includes(action)) {
      throw new RangeError('Unsupported Ballet recovery action.');
    }
    const requestFingerprint = fingerprint(discordUserId, action);

    return withTransaction(this.pool, async (client) => {
      await ensureAndLockUser(client, discordUserId);
      const replay = await findAction(client, interactionId);
      if (replay !== undefined) {
        assertAction(replay, discordUserId, action, requestFingerprint);
        return parseRecoveryResult(replay.result_snapshot, true);
      }

      const now = await this.getCurrentTime(client);
      const lastAction = await client.query<{ readonly created_at: Date }>(
        `SELECT created_at FROM ballet_training_actions
         WHERE discord_user_id = $1 AND action_type <> 'SHOE_FIT'
         ORDER BY created_at DESC LIMIT 1`,
        [discordUserId],
      );
      const lastActionAt = lastAction.rows[0]?.created_at;
      const cooldownMs = BALLET_TRAINING_V3_RULES.recoveryCooldownHours * 3_600_000;
      if (lastActionAt !== undefined && now.getTime() < lastActionAt.getTime() + cooldownMs) {
        throw new BalletTrainingCooldownError(new Date(lastActionAt.getTime() + cooldownMs));
      }

      await ensureStateRows(client, discordUserId);
      const condition = await loadCondition(client, discordUserId, now, true);
      const setback = await loadActiveSetback(client, discordUserId, true);
      if (action === 'REHABILITATE' && setback === null) {
        throw new BalletRehabilitationUnavailableError();
      }

      const nextCondition = applyRecoveryAction(condition, action, now);
      await saveCondition(client, discordUserId, nextCondition);
      if (action === 'REHABILITATE' && setback !== null) {
        const update = await client.query(
          `UPDATE ballet_training_setbacks
           SET completed_rehab_sessions = completed_rehab_sessions + 1,
               status = CASE WHEN completed_rehab_sessions + 1 >= required_rehab_sessions THEN 'RECOVERED' ELSE 'ACTIVE' END,
               recovered_at = CASE WHEN completed_rehab_sessions + 1 >= required_rehab_sessions THEN $2 ELSE NULL END
           WHERE discord_user_id = $1 AND status = 'ACTIVE'
           RETURNING setback_id`,
          [discordUserId, now],
        );
        if (update.rows[0] === undefined) throw new BalletRehabilitationUnavailableError();
        await client.query(
          `INSERT INTO ballet_rehabilitation_sessions
             (interaction_id, discord_user_id, setback_id, request_fingerprint, completed_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [interactionId, discordUserId, update.rows[0].setback_id, requestFingerprint, now],
        );
      }

      const snapshot = await loadSnapshot(client, discordUserId, now);
      const result: BalletRecoveryResult = { action, snapshot, replayed: false };
      await recordAction(
        client,
        interactionId,
        discordUserId,
        action,
        requestFingerprint,
        result,
        now,
      );
      return result;
    });
  }

  public async setShoeFitProfile(
    interactionId: string,
    discordUserId: string,
    sizeEu: number,
    fit: 'STANDARD' | 'NARROW' | 'WIDE',
  ): Promise<{ readonly profile: BalletShoeFitProfile; readonly replayed: boolean }> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const requestFingerprint = fingerprint(discordUserId, 'SHOE_FIT', sizeEu, fit);
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockUser(client, discordUserId);
      const replay = await findAction(client, interactionId);
      if (replay !== undefined) {
        assertAction(replay, discordUserId, 'SHOE_FIT', requestFingerprint);
        return parseFitResult(replay.result_snapshot, true);
      }
      const now = await this.getCurrentTime(client);
      const profile = validateShoeFitProfile(sizeEu, fit, now);
      await client.query(
        `INSERT INTO ballet_equipment_fit_profiles
           (discord_user_id, game_shoe_size_eu, game_fit, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (discord_user_id) DO UPDATE
           SET game_shoe_size_eu = EXCLUDED.game_shoe_size_eu,
               game_fit = EXCLUDED.game_fit,
               updated_at = EXCLUDED.updated_at`,
        [discordUserId, sizeEu, fit, now],
      );
      const result = { profile, replayed: false };
      await recordAction(
        client,
        interactionId,
        discordUserId,
        'SHOE_FIT',
        requestFingerprint,
        result,
        now,
      );
      return result;
    });
  }

  public async prepareClassAttempt(
    client: PoolClient,
    discordUserId: string,
  ): Promise<BalletTrainingAttemptContext> {
    await ensureStateRows(client, discordUserId);
    const now = await this.getCurrentTime(client);
    const condition = await loadCondition(client, discordUserId, now, true);
    await saveCondition(client, discordUserId, condition);
    const skills = await loadSkills(client, discordUserId, true);
    const activeSetback = await loadActiveSetback(client, discordUserId, true);
    const performanceModifier =
      conditionScoreModifier(condition) + (activeSetback === null ? 0 : -2);
    return { skills, condition, performanceModifier, capturedAt: now };
  }

  public async recordClassAttemptWithinTransaction(
    client: PoolClient,
    input: BalletTrainingAttemptInput,
  ): Promise<BalletTrainingMutationResult> {
    const afterCondition = applyExerciseCondition(
      input.context.condition,
      input.difficulty,
      input.context.capturedAt,
    );
    await saveCondition(client, input.discordUserId, afterCondition);
    await recordSkillEvent(client, {
      interactionId: input.interactionId,
      discordUserId: input.discordUserId,
      sourceType: 'CLASS_ATTEMPT',
      sourceReference: input.attemptId,
      family: input.family,
      outcome: input.outcome,
      now: input.context.capturedAt,
    });
    await recordWorkload(client, {
      interactionId: input.interactionId,
      discordUserId: input.discordUserId,
      sourceType: 'CLASS_ATTEMPT',
      sourceReference: input.attemptId,
      now: input.context.capturedAt,
      random: this.random,
    });
    const setbackRollQualified = shouldCreateTrainingSetback(
      input.outcome,
      afterCondition.fatigue,
      input.setbackRoll,
    );
    let setbackTriggered = false;
    if (setbackRollQualified) {
      const active = await loadActiveSetback(client, input.discordUserId, true);
      if (active === null) {
        await client.query(
          `INSERT INTO ballet_training_setbacks
             (setback_id, discord_user_id, kind, status, required_rehab_sessions, source_attempt_id, started_at)
           VALUES ($1, $2, 'MINOR_TRAINING_STRAIN', 'ACTIVE', $3, $4, $5)`,
          [
            randomUUID(),
            input.discordUserId,
            BALLET_TRAINING_V3_RULES.setback.requiredRehabSessions,
            input.attemptId,
            input.context.capturedAt,
          ],
        );
        setbackTriggered = true;
      }
    }
    await client.query(
      `INSERT INTO ballet_training_attempt_effects
         (attempt_id, interaction_id, discord_user_id, training_skill_snapshot, condition_snapshot, performance_modifier, setback_triggered)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
      [
        input.attemptId,
        input.interactionId,
        input.discordUserId,
        JSON.stringify(input.context.skills),
        JSON.stringify(input.context.condition),
        input.context.performanceModifier,
        setbackTriggered,
      ],
    );
    const snapshot = await loadSnapshot(client, input.discordUserId, input.context.capturedAt);
    return { snapshot, setbackTriggered };
  }

  public async recordPracticeWithinTransaction(
    client: PoolClient,
    input: {
      readonly interactionId: string;
      readonly discordUserId: string;
      readonly activityCode: string;
    },
  ): Promise<BalletTrainingV3Snapshot> {
    await ensureStateRows(client, input.discordUserId);
    const now = await this.getCurrentTime(client);
    const condition = await loadCondition(client, input.discordUserId, now, true);
    const nextCondition = applyExerciseCondition(condition, 2, now);
    await saveCondition(client, input.discordUserId, nextCondition);
    const family = activityFamily(input.activityCode);
    await recordSkillEvent(client, {
      interactionId: input.interactionId,
      discordUserId: input.discordUserId,
      sourceType: 'BALLET_PRACTICE',
      sourceReference: input.interactionId,
      family,
      outcome: 'SUCCESS',
      now,
    });
    await recordWorkload(client, {
      interactionId: input.interactionId,
      discordUserId: input.discordUserId,
      sourceType: 'BALLET_PRACTICE',
      sourceReference: input.activityCode + ':' + input.interactionId,
      now,
      random: this.random,
    });
    return loadSnapshot(client, input.discordUserId, now);
  }

  private async getCurrentTime(client: PoolClient): Promise<Date> {
    const now = await this.clock(client);
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new Error('Training clock returned an invalid timestamp.');
    }
    return now;
  }
}

async function ensureAndLockUser(client: PoolClient, discordUserId: string): Promise<void> {
  await client.query(
    `INSERT INTO discord_users (discord_user_id) VALUES ($1)
     ON CONFLICT (discord_user_id) DO NOTHING`,
    [discordUserId],
  );
  const locked = await client.query(
    'SELECT discord_user_id FROM discord_users WHERE discord_user_id = $1 FOR UPDATE',
    [discordUserId],
  );
  if (locked.rows[0] === undefined) throw new Error('Training profile user lock failed.');
}

async function ensureStateRows(client: PoolClient, discordUserId: string): Promise<void> {
  await client.query(
    `INSERT INTO ballet_training_condition (discord_user_id)
     VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING`,
    [discordUserId],
  );
  for (const key of BALLET_TRAINING_SKILLS) {
    await client.query(
      `INSERT INTO ballet_training_skills (discord_user_id, skill_key)
       VALUES ($1, $2) ON CONFLICT (discord_user_id, skill_key) DO NOTHING`,
      [discordUserId, key],
    );
  }
}

async function loadSnapshot(
  client: PoolClient,
  discordUserId: string,
  now: Date,
): Promise<BalletTrainingV3Snapshot> {
  const [skills, condition, cycle, setback, fit] = await Promise.all([
    loadSkills(client, discordUserId, false),
    loadCondition(client, discordUserId, now, false),
    loadLatestCycle(client, discordUserId, now),
    loadLatestSetback(client, discordUserId, false),
    loadFit(client, discordUserId),
  ]);
  return {
    skills,
    condition: recoverConditionOverTime(condition, now),
    staminaCycle: cycle,
    setback,
    shoeFit: fit,
  };
}

async function loadSkills(
  client: PoolClient,
  discordUserId: string,
  forUpdate: boolean,
): Promise<BalletTrainingSkillValues> {
  const result = await client.query<SkillRow>(
    `SELECT skill_key, skill_value FROM ballet_training_skills
     WHERE discord_user_id = $1 ORDER BY skill_key${forUpdate ? ' FOR UPDATE' : ''}`,
    [discordUserId],
  );
  const values: Record<BalletTrainingSkill, number> = { ...createInitialTrainingSkills() };
  for (const row of result.rows) {
    if ((BALLET_TRAINING_SKILLS as readonly string[]).includes(row.skill_key))
      values[row.skill_key as BalletTrainingSkill] = row.skill_value;
  }
  return values;
}

async function loadCondition(
  client: PoolClient,
  discordUserId: string,
  now: Date,
  forUpdate: boolean,
): Promise<BalletConditionSnapshot> {
  const result = await client.query<ConditionRow>(
    `SELECT energy, nutrition, fatigue, sleep_debt, updated_at
     FROM ballet_training_condition WHERE discord_user_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [discordUserId],
  );
  const row = result.rows[0];
  if (row === undefined) return createInitialCondition(now);
  return {
    energy: row.energy,
    nutrition: row.nutrition,
    fatigue: row.fatigue,
    sleepDebt: row.sleep_debt,
    updatedAt: row.updated_at,
  };
}

async function saveCondition(
  client: PoolClient,
  discordUserId: string,
  condition: BalletConditionSnapshot,
): Promise<void> {
  await client.query(
    `INSERT INTO ballet_training_condition
       (discord_user_id, energy, nutrition, fatigue, sleep_debt, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (discord_user_id) DO UPDATE
       SET energy = EXCLUDED.energy,
           nutrition = EXCLUDED.nutrition,
           fatigue = EXCLUDED.fatigue,
           sleep_debt = EXCLUDED.sleep_debt,
           updated_at = EXCLUDED.updated_at`,
    [
      discordUserId,
      condition.energy,
      condition.nutrition,
      condition.fatigue,
      condition.sleepDebt,
      condition.updatedAt,
    ],
  );
}

async function loadLatestCycle(
  client: PoolClient,
  discordUserId: string,
  now: Date,
): Promise<BalletStaminaCycleSnapshot | null> {
  const result = await client.query<CycleRow>(
    `SELECT cycle_number, target_workload, completed_workload, status, started_at, deadline_at, completed_at, below_floor_exception
     FROM ballet_stamina_cycles WHERE discord_user_id = $1
     ORDER BY cycle_number DESC LIMIT 1`,
    [discordUserId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  if (row.status !== 'ACTIVE' && row.status !== 'COMPLETED' && row.status !== 'EXPIRED')
    throw new Error('Invalid persisted stamina cycle status.');
  const expired = row.status === 'ACTIVE' && row.deadline_at.getTime() <= now.getTime();
  return {
    cycleNumber: row.cycle_number,
    targetWorkload: row.target_workload,
    completedWorkload: row.completed_workload,
    status: expired ? 'EXPIRED' : row.status,
    startedAt: row.started_at,
    deadlineAt: row.deadline_at,
    completedAt: row.completed_at,
    belowFloorException: row.below_floor_exception,
  };
}

async function loadLatestSetback(
  client: PoolClient,
  discordUserId: string,
  forUpdate: boolean,
): Promise<BalletTrainingSetbackSnapshot> {
  const result = await client.query<SetbackRow>(
    `SELECT kind, status, required_rehab_sessions, completed_rehab_sessions, started_at, recovered_at
     FROM ballet_training_setbacks WHERE discord_user_id = $1
     ORDER BY started_at DESC LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [discordUserId],
  );
  const row = result.rows[0];
  if (row === undefined)
    return {
      status: 'NONE',
      kind: null,
      requiredRehabSessions: 0,
      completedRehabSessions: 0,
      startedAt: null,
      recoveredAt: null,
    };
  if (row.status !== 'ACTIVE' && row.status !== 'RECOVERED')
    throw new Error('Invalid persisted training setback status.');
  return {
    status: row.status,
    kind: row.kind === 'MINOR_TRAINING_STRAIN' ? row.kind : null,
    requiredRehabSessions: row.required_rehab_sessions,
    completedRehabSessions: row.completed_rehab_sessions,
    startedAt: row.started_at,
    recoveredAt: row.recovered_at,
  };
}

async function loadActiveSetback(
  client: PoolClient,
  discordUserId: string,
  forUpdate: boolean,
): Promise<BalletTrainingSetbackSnapshot | null> {
  const result = await client.query<SetbackRow>(
    `SELECT kind, status, required_rehab_sessions, completed_rehab_sessions, started_at, recovered_at
     FROM ballet_training_setbacks WHERE discord_user_id = $1 AND status = 'ACTIVE'
     ORDER BY started_at DESC LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [discordUserId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    status: 'ACTIVE',
    kind: row.kind === 'MINOR_TRAINING_STRAIN' ? row.kind : null,
    requiredRehabSessions: row.required_rehab_sessions,
    completedRehabSessions: row.completed_rehab_sessions,
    startedAt: row.started_at,
    recoveredAt: null,
  };
}

async function loadFit(
  client: PoolClient,
  discordUserId: string,
): Promise<BalletShoeFitProfile | null> {
  const result = await client.query<FitRow>(
    `SELECT game_shoe_size_eu, game_fit, updated_at FROM ballet_equipment_fit_profiles WHERE discord_user_id = $1`,
    [discordUserId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  if (row.game_fit !== 'STANDARD' && row.game_fit !== 'NARROW' && row.game_fit !== 'WIDE')
    throw new Error('Invalid persisted fictional shoe fit preference.');
  return { sizeEu: Number(row.game_shoe_size_eu), fit: row.game_fit, updatedAt: row.updated_at };
}

async function recordSkillEvent(
  client: PoolClient,
  input: {
    interactionId: string;
    discordUserId: string;
    sourceType: 'CLASS_ATTEMPT' | 'BALLET_PRACTICE';
    sourceReference: string;
    family: string;
    outcome: BalletExerciseOutcome;
    now: Date;
  },
): Promise<BalletTrainingSkillValues> {
  const current = await loadSkills(client, input.discordUserId, true);
  const recent = await client.query<{ readonly event_count: string }>(
    `SELECT count(*)::text AS event_count FROM ballet_training_skill_events
     WHERE discord_user_id = $1 AND recorded_at >= $2::timestamptz - interval '24 hours'`,
    [input.discordUserId, input.now],
  );
  const count = Number(recent.rows[0]?.event_count ?? '0');
  const next = skillValuesAfterAttempt(current, input.family, input.outcome, count);
  const gains: Partial<Record<BalletTrainingSkill, number>> = {};
  for (const skill of BALLET_TRAINING_SKILLS) {
    const difference = next[skill] - current[skill];
    if (difference > 0) {
      gains[skill] = difference;
      await client.query(
        `UPDATE ballet_training_skills SET skill_value = $3, updated_at = $4
         WHERE discord_user_id = $1 AND skill_key = $2`,
        [input.discordUserId, skill, next[skill], input.now],
      );
    }
  }
  await client.query(
    `INSERT INTO ballet_training_skill_events
       (interaction_id, discord_user_id, source_type, source_reference, gains, recorded_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      input.interactionId,
      input.discordUserId,
      input.sourceType,
      input.sourceReference,
      JSON.stringify(gains),
      input.now,
    ],
  );
  return next;
}

async function recordWorkload(
  client: PoolClient,
  input: {
    interactionId: string;
    discordUserId: string;
    sourceType: 'CLASS_ATTEMPT' | 'BALLET_PRACTICE';
    sourceReference: string;
    now: Date;
    random: () => number;
  },
): Promise<void> {
  const active = await client.query<CycleRow>(
    `SELECT cycle_number, target_workload, completed_workload, status, started_at, deadline_at, completed_at, below_floor_exception
     FROM ballet_stamina_cycles WHERE discord_user_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
    [input.discordUserId],
  );
  let cycle = active.rows[0];
  if (cycle !== undefined && cycle.deadline_at.getTime() <= input.now.getTime()) {
    await client.query(
      `UPDATE ballet_stamina_cycles SET status = 'EXPIRED' WHERE discord_user_id = $1 AND status = 'ACTIVE'`,
      [input.discordUserId],
    );
    cycle = undefined;
  }
  if (cycle === undefined) {
    const previous = await client.query<CycleRow>(
      `SELECT cycle_number, target_workload, completed_workload, status, started_at, deadline_at, completed_at, below_floor_exception
       FROM ballet_stamina_cycles WHERE discord_user_id = $1
       ORDER BY cycle_number DESC LIMIT 1 FOR UPDATE`,
      [input.discordUserId],
    );
    const old = previous.rows[0];
    const nextNumber = (old?.cycle_number ?? 0) + 1;
    const generated = nextStaminaCycle(
      nextNumber,
      old?.completed_workload ?? 0,
      input.now,
      input.random(),
      input.random(),
    );
    const inserted = await client.query<CycleRow>(
      `INSERT INTO ballet_stamina_cycles
         (cycle_id, discord_user_id, cycle_number, target_workload, completed_workload, status, below_floor_exception, started_at, deadline_at)
       VALUES ($1, $2, $3, $4, 0, 'ACTIVE', $5, $6, $7)
       RETURNING cycle_number, target_workload, completed_workload, status, started_at, deadline_at, completed_at, below_floor_exception`,
      [
        randomUUID(),
        input.discordUserId,
        generated.cycleNumber,
        generated.targetWorkload,
        generated.belowFloorException,
        generated.startedAt,
        generated.deadlineAt,
      ],
    );
    cycle = inserted.rows[0];
  }
  if (cycle === undefined) throw new Error('Stamina cycle could not be initialized.');
  const event = await client.query(
    `INSERT INTO ballet_stamina_workload_events
       (interaction_id, discord_user_id, cycle_id, source_type, source_reference, recorded_at)
     SELECT $1, $2, cycle_id, $4, $5, $6 FROM ballet_stamina_cycles
     WHERE discord_user_id = $2 AND cycle_number = $3`,
    [
      input.interactionId,
      input.discordUserId,
      cycle.cycle_number,
      input.sourceType,
      input.sourceReference,
      input.now,
    ],
  );
  if (event.rowCount !== 1) throw new Error('Stamina workload event was not recorded.');
  const updated = await client.query(
    `UPDATE ballet_stamina_cycles
     SET completed_workload = completed_workload + 1,
         status = CASE WHEN completed_workload + 1 >= target_workload THEN 'COMPLETED' ELSE 'ACTIVE' END,
         completed_at = CASE WHEN completed_workload + 1 >= target_workload THEN $2 ELSE NULL END
     WHERE discord_user_id = $1 AND cycle_number = $3 AND status = 'ACTIVE'`,
    [input.discordUserId, input.now, cycle.cycle_number],
  );
  if (updated.rowCount !== 1) throw new Error('Stamina cycle workload was not advanced.');
}

async function getDatabaseTime(client: PoolClient): Promise<Date> {
  const result = await client.query<ClockRow>('SELECT clock_timestamp() AS now');
  const now = result.rows[0]?.now;
  if (now === undefined)
    throw new Error('Database did not return current time for Ballet Training V3.');
  return now;
}

async function findAction(
  client: PoolClient,
  interactionId: string,
): Promise<ActionRow | undefined> {
  const result = await client.query<ActionRow>(
    `SELECT discord_user_id, action_type, request_fingerprint, result_snapshot
     FROM ballet_training_actions WHERE interaction_id = $1`,
    [interactionId],
  );
  return result.rows[0];
}

async function recordAction(
  client: PoolClient,
  interactionId: string,
  discordUserId: string,
  action: string,
  requestFingerprint: string,
  result: unknown,
  createdAt: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO ballet_training_actions
       (interaction_id, discord_user_id, action_type, request_fingerprint, result_snapshot, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [interactionId, discordUserId, action, requestFingerprint, JSON.stringify(result), createdAt],
  );
}

function assertAction(
  action: ActionRow,
  userId: string,
  actionType: string,
  requestFingerprint: string,
): void {
  if (
    action.discord_user_id !== userId ||
    action.action_type !== actionType ||
    action.request_fingerprint !== requestFingerprint
  ) {
    if (action.discord_user_id !== userId) throw new IdempotencyConflictError();
    throw new BalletTrainingActionReplayConflictError();
  }
}

function parseRecoveryResult(value: unknown, replayed: boolean): BalletRecoveryResult {
  const snapshot = getObject(value);
  if (
    (BALLET_RECOVERY_ACTIONS as readonly string[]).includes(String(snapshot.action)) &&
    isTrainingSnapshot(snapshot.snapshot)
  ) {
    return {
      action: snapshot.action as BalletRecoveryAction,
      snapshot: normalizeSnapshot(snapshot.snapshot),
      replayed,
    };
  }
  throw new Error('Persisted Ballet recovery result is invalid.');
}

function parseFitResult(
  value: unknown,
  replayed: boolean,
): { profile: BalletShoeFitProfile; replayed: boolean } {
  const snapshot = getObject(value);
  const profile = getObject(snapshot.profile);
  if (
    typeof profile.sizeEu === 'number' &&
    (profile.fit === 'STANDARD' || profile.fit === 'NARROW' || profile.fit === 'WIDE')
  ) {
    return {
      profile: {
        sizeEu: profile.sizeEu,
        fit: profile.fit,
        updatedAt: parseDate(profile.updatedAt),
      },
      replayed,
    };
  }
  throw new Error('Persisted shoe-fit action result is invalid.');
}

function isTrainingSnapshot(value: unknown): boolean {
  const snapshot = getObject(value);
  return (
    snapshot.skills !== undefined &&
    snapshot.condition !== undefined &&
    snapshot.setback !== undefined
  );
}

function normalizeSnapshot(value: unknown): BalletTrainingV3Snapshot {
  const raw = getObject(value);
  const skillValues = getObject(raw.skills) as Partial<Record<BalletTrainingSkill, unknown>>;
  const skills: Record<BalletTrainingSkill, number> = { ...createInitialTrainingSkills() };
  for (const key of BALLET_TRAINING_SKILLS) {
    const candidate = skillValues[key];
    if (typeof candidate === 'number') skills[key] = candidate;
  }
  const conditionRaw = getObject(raw.condition);
  const condition: BalletConditionSnapshot = {
    energy: numberField(conditionRaw.energy),
    nutrition: numberField(conditionRaw.nutrition),
    fatigue: numberField(conditionRaw.fatigue),
    sleepDebt: numberField(conditionRaw.sleepDebt),
    updatedAt: parseDate(conditionRaw.updatedAt),
  };
  const setbackRaw = getObject(raw.setback);
  const status = setbackRaw.status;
  if (status !== 'NONE' && status !== 'ACTIVE' && status !== 'RECOVERED')
    throw new Error('Invalid setback status in saved recovery action.');
  const cycleRaw = raw.staminaCycle === null ? null : getObject(raw.staminaCycle);
  const shoeRaw = raw.shoeFit === null ? null : getObject(raw.shoeFit);
  return {
    skills,
    condition,
    staminaCycle:
      cycleRaw === null
        ? null
        : {
            cycleNumber: numberField(cycleRaw.cycleNumber),
            targetWorkload: numberField(cycleRaw.targetWorkload),
            completedWorkload: numberField(cycleRaw.completedWorkload),
            status: cycleRaw.status as BalletStaminaCycleSnapshot['status'],
            startedAt: parseDate(cycleRaw.startedAt),
            deadlineAt: parseDate(cycleRaw.deadlineAt),
            completedAt: cycleRaw.completedAt === null ? null : parseDate(cycleRaw.completedAt),
            belowFloorException: cycleRaw.belowFloorException === true,
          },
    setback: {
      status,
      kind: setbackRaw.kind === 'MINOR_TRAINING_STRAIN' ? 'MINOR_TRAINING_STRAIN' : null,
      requiredRehabSessions: numberField(setbackRaw.requiredRehabSessions),
      completedRehabSessions: numberField(setbackRaw.completedRehabSessions),
      startedAt: setbackRaw.startedAt === null ? null : parseDate(setbackRaw.startedAt),
      recoveredAt: setbackRaw.recoveredAt === null ? null : parseDate(setbackRaw.recoveredAt),
    },
    shoeFit:
      shoeRaw === null
        ? null
        : {
            sizeEu: numberField(shoeRaw.sizeEu),
            fit: shoeRaw.fit as NonNullable<BalletTrainingV3Snapshot['shoeFit']>['fit'],
            updatedAt: parseDate(shoeRaw.updatedAt),
          },
  };
}

function activityFamily(activityCode: string): string {
  if (activityCode.includes('stretch')) return 'Adagio';
  if (activityCode.includes('pointe')) return 'Pirouette preparation';
  if (activityCode.includes('center') || activityCode.includes('centre')) return 'Centre practice';
  if (activityCode.includes('choreography') || activityCode.includes('rehearsal'))
    return 'Original repertoire';
  return 'Technique';
}

function fingerprint(...parts: readonly (string | number)[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function getObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  throw new Error('Persisted Ballet Training V3 snapshot is invalid.');
}

function numberField(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Persisted Ballet Training V3 number is invalid.');
  return value;
}

function parseDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime()))
    throw new Error('Persisted Ballet Training V3 timestamp is invalid.');
  return date;
}
