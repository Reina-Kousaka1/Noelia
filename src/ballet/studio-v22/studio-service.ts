import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../../database/transaction.js';
import { assertDiscordSnowflake } from '../../utils/discord-snowflake.js';
import { conditionScoreModifier } from '../training-v3/rules.js';
import type { BalletTrainingV3Snapshot } from '../training-v3/types.js';
import { BALLET_CLASS_SECTIONS } from '../class/types.js';
import {
  MADAME_STUDIO_RULES,
  easeMood,
  moodAfterAttempt,
  moodAfterIgnoredCorrectiveTask,
  moodDecay,
  moreSevereMood,
  nextPatience,
} from './rules.js';
import { MADAME_MOODS, STUDIO_REACTION_CODES } from './types.js';
import type {
  BalletStudioAttemptInput,
  BalletStudioAttemptResult,
  BalletStudioCorrectiveTask,
  BalletStudioCycleAdjustment,
  BalletStudioReadiness,
  BalletStudioV22Port,
  BalletWeeklyStudioCard,
  MadameMood,
  StudioReactionCode,
} from './types.js';

interface ClockRow extends QueryResultRow {
  readonly now: Date;
}

interface MoodRow extends QueryResultRow {
  readonly mood: string;
  readonly consecutive_failures: number;
  readonly preparation_gap_streak: number;
  readonly updated_at: Date;
}

interface SessionRow extends QueryResultRow {
  readonly patience: number;
  readonly consecutive_failures: number;
  readonly status: string;
}

interface ActiveClassRow extends QueryResultRow {
  readonly class_id: string;
  readonly status: 'PREPARING' | 'IN_PROGRESS';
}

interface TaskRow extends QueryResultRow {
  readonly task_id: string;
  readonly target_section: string;
  readonly reason_code: string;
  readonly created_at: Date;
  readonly due_at: Date;
}

interface FollowupRow extends QueryResultRow {
  readonly followup_id: string;
  readonly extra_workload: number;
  readonly expires_at: Date;
}

interface ExpiredTaskRow extends QueryResultRow {
  readonly task_id: string;
  readonly source_class_id: string;
  readonly source_attempt_id: string;
}

type StudioEventType =
  | 'ATTEMPT_RESOLVED'
  | 'CORRECTIVE_ASSIGNED'
  | 'CORRECTIVE_COMPLETED'
  | 'CORRECTIVE_EXPIRED'
  | 'SESSION_ENDED_EARLY'
  | 'FOLLOWUP_ASSIGNED'
  | 'FOLLOWUP_CONSUMED'
  | 'FOLLOWUP_EXPIRED'
  | 'MOOD_EASED'
  | 'RECOVERY_RESOLVED';

type StudioReasonCode =
  | 'NORMAL_SUCCESS'
  | 'NORMAL_FAILURE'
  | 'REPEATED_TRAINING_FAILURE'
  | 'PREPARATION_GAP'
  | 'REPEATED_PREPARATION_FAILURE'
  | 'CORRECTIVE_TASK_COMPLETED'
  | 'CORRECTIVE_TASK_IGNORED'
  | 'PATIENCE_EXHAUSTED'
  | 'EARLY_SESSION_END'
  | 'FOLLOWUP_CONSUMED'
  | 'FOLLOWUP_EXPIRED'
  | 'MOOD_DECAY'
  | 'FICTIONAL_SETBACK_RESOLVED'
  | 'NEUTRAL_ATTEMPT';

interface StudioEventInput {
  readonly eventKey: string;
  readonly discordUserId: string;
  readonly eventType: StudioEventType;
  readonly reasonCode: StudioReasonCode;
  readonly occurredAt: Date;
  readonly classId?: string;
  readonly attemptId?: string;
  readonly taskId?: string;
  readonly followupId?: string;
  readonly cycleId?: string;
  readonly moodBefore?: MadameMood;
  readonly moodAfter?: MadameMood;
  readonly patienceBefore?: number;
  readonly patienceAfter?: number;
  readonly payload?: Readonly<Record<string, unknown>>;
}

const maximumCarryoverTarget = 70;
const dayMs = 24 * 60 * 60 * 1_000;

/** Persistent V2.2 teacher state layered onto the existing V2.1 class and training transactions. */
export class BalletStudioV22Service implements BalletStudioV22Port {
  public constructor(private readonly pool: Pool) {}

  public async ensureSessionWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    classId: string,
    classStatus: 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED',
  ): Promise<void> {
    await ensureMoodState(client, discordUserId);
    const status =
      classStatus === 'COMPLETED'
        ? 'COMPLETED'
        : classStatus === 'ABANDONED'
          ? 'ABANDONED'
          : 'ACTIVE';
    await client.query(
      `INSERT INTO ballet_studio_session_states (class_id, discord_user_id, status)
       VALUES ($1::uuid, $2, $3) ON CONFLICT (class_id) DO NOTHING`,
      [classId, discordUserId, status],
    );
  }

  public async closeSessionWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    classId: string,
    status: 'COMPLETED' | 'ABANDONED',
  ): Promise<void> {
    await client.query(
      `UPDATE ballet_studio_session_states
       SET status = $3, updated_at = clock_timestamp()
       WHERE class_id = $1::uuid AND discord_user_id = $2 AND status = 'ACTIVE'`,
      [classId, discordUserId, status],
    );
  }

  public async recordAttemptWithinTransaction(
    client: PoolClient,
    input: BalletStudioAttemptInput,
  ): Promise<BalletStudioAttemptResult> {
    const existing = await client.query<{ readonly event_payload: unknown }>(
      `SELECT event_payload FROM ballet_studio_events
       WHERE event_key = $1 AND discord_user_id = $2 AND class_id = $3::uuid
         AND attempt_id = $4::uuid`,
      [`attempt:${input.attemptId}:resolved`, input.discordUserId, input.classId, input.attemptId],
    );
    const persisted = existing.rows[0]?.event_payload;
    if (persisted !== undefined) return parseResult(persisted);

    await ensureMoodState(client, input.discordUserId);
    await client.query(
      `INSERT INTO ballet_studio_session_states (class_id, discord_user_id, status)
       VALUES ($1::uuid, $2, 'ACTIVE') ON CONFLICT (class_id) DO NOTHING`,
      [input.classId, input.discordUserId],
    );

    const now = await getDatabaseTime(client);
    await applyMoodDecay(client, input.discordUserId, now);
    await expireCorrectiveTasks(client, input.discordUserId, now);
    await expirePendingFollowups(client, input.discordUserId, now);

    const mood = await loadMood(client, input.discordUserId, true);
    const session = await loadSession(client, input.discordUserId, input.classId, true);
    if (session.status !== 'ACTIVE') throw new Error('Madame session state is not active.');

    const sessionFailureStreak = input.outcome === 'FAIL' ? session.consecutive_failures + 1 : 0;
    const userFailureStreak = input.outcome === 'FAIL' ? mood.consecutive_failures + 1 : 0;
    const preparationGapStreak =
      input.preparationStatus === 'PREPARED' ? 0 : mood.preparation_gap_streak + 1;
    const moodBefore = parseMood(mood.mood);
    let moodAfter = moodAfterAttempt(
      moodBefore,
      input.outcome,
      userFailureStreak,
      preparationGapStreak,
      input.preparationStatus,
    );
    const patience = nextPatience(session.patience, input.outcome);

    const reactions: StudioReactionCode[] = [];
    const succeeded = input.outcome === 'PERFECT' || input.outcome === 'SUCCESS';
    if (succeeded) reactions.push('NORMAL_SUCCESS');
    else if (input.outcome === 'FAIL') {
      reactions.push(sessionFailureStreak >= 2 ? 'REPEATED_FAILURE' : 'NORMAL_FAILURE');
    }
    if (input.preparationStatus !== 'PREPARED') reactions.push('PREPARATION_WARNING');

    const completedTask = await completeCorrectiveTask(client, input, now, succeeded);
    if (completedTask !== null) {
      reactions.push('CORRECTIVE_COMPLETED');
      await appendEvent(client, {
        eventKey: `task:${completedTask.task_id}:completed`,
        discordUserId: input.discordUserId,
        classId: input.classId,
        attemptId: input.attemptId,
        taskId: completedTask.task_id,
        eventType: 'CORRECTIVE_COMPLETED',
        reasonCode: 'CORRECTIVE_TASK_COMPLETED',
        occurredAt: now,
        moodBefore,
        moodAfter,
        patienceBefore: session.patience,
        patienceAfter: patience,
      });
    }

    let assignedTask: TaskRow | null = null;
    const repeatedPreparationFailure =
      input.preparationReasonCode === 'REPEATED_PREPARATION_FAILURE';
    const shouldAssignTask =
      input.outcome === 'FAIL' &&
      (sessionFailureStreak >= MADAME_STUDIO_RULES.correctiveAfterConsecutiveFailures ||
        repeatedPreparationFailure);
    if (shouldAssignTask) {
      assignedTask = await assignCorrectiveTask(client, input, now, repeatedPreparationFailure);
      if (assignedTask !== null) {
        reactions.push('CORRECTIVE_ASSIGNED');
        await appendEvent(client, {
          eventKey: `task:${assignedTask.task_id}:assigned`,
          discordUserId: input.discordUserId,
          classId: input.classId,
          attemptId: input.attemptId,
          taskId: assignedTask.task_id,
          eventType: 'CORRECTIVE_ASSIGNED',
          reasonCode: repeatedPreparationFailure
            ? 'REPEATED_PREPARATION_FAILURE'
            : 'REPEATED_TRAINING_FAILURE',
          occurredAt: now,
          moodBefore,
          moodAfter,
          patienceBefore: session.patience,
          patienceAfter: patience,
          payload: { targetSection: assignedTask.target_section },
        });
      }
    }

    if (input.outcome === 'FAIL' && patience <= 1) reactions.push('PATIENCE_LOW');
    const sessionEndedEarly =
      input.outcome === 'FAIL' &&
      !input.finalExercise &&
      sessionFailureStreak >= MADAME_STUDIO_RULES.earlyEndAfterConsecutiveFailures;
    let assignedFollowup: FollowupRow | null = null;
    if (sessionEndedEarly) {
      moodAfter = moodAfterAttempt(
        moodAfter,
        input.outcome,
        Math.max(userFailureStreak, MADAME_STUDIO_RULES.earlyEndAfterConsecutiveFailures),
        preparationGapStreak,
        input.preparationStatus,
      );
      reactions.push('SESSION_ENDED');
      assignedFollowup = await assignFollowup(client, {
        discordUserId: input.discordUserId,
        reasonCode: 'EARLY_SESSION_END',
        sourceAttemptId: input.attemptId,
        sourceClassId: input.classId,
        sourceTaskId: null,
        now,
      });
      if (assignedFollowup !== null) {
        reactions.push('FOLLOWUP_ASSIGNED');
        await appendEvent(client, {
          eventKey: `followup:${assignedFollowup.followup_id}:assigned`,
          discordUserId: input.discordUserId,
          classId: input.classId,
          attemptId: input.attemptId,
          followupId: assignedFollowup.followup_id,
          eventType: 'FOLLOWUP_ASSIGNED',
          reasonCode: 'EARLY_SESSION_END',
          occurredAt: now,
          moodBefore,
          moodAfter,
          patienceBefore: session.patience,
          patienceAfter: patience,
          payload: { extraWorkload: assignedFollowup.extra_workload },
        });
      }
      await appendEvent(client, {
        eventKey: `attempt:${input.attemptId}:session-ended`,
        discordUserId: input.discordUserId,
        classId: input.classId,
        attemptId: input.attemptId,
        eventType: 'SESSION_ENDED_EARLY',
        reasonCode: 'EARLY_SESSION_END',
        occurredAt: now,
        moodBefore,
        moodAfter,
        patienceBefore: session.patience,
        patienceAfter: patience,
        payload: { consecutiveFailures: sessionFailureStreak },
      });
      await client.query(
        `UPDATE ballet_studio_session_states
         SET patience = $3, consecutive_failures = $4, status = 'ABANDONED',
             early_ended_at = $5, updated_at = $5
         WHERE class_id = $1::uuid AND discord_user_id = $2 AND status = 'ACTIVE'`,
        [input.classId, input.discordUserId, patience, sessionFailureStreak, now],
      );
    } else {
      await client.query(
        `UPDATE ballet_studio_session_states
         SET patience = $3, consecutive_failures = $4, updated_at = $5
         WHERE class_id = $1::uuid AND discord_user_id = $2 AND status = 'ACTIVE'`,
        [input.classId, input.discordUserId, patience, sessionFailureStreak, now],
      );
    }

    if (input.outcome === 'FAIL' && sessionFailureStreak >= 2) {
      moodAfter = moreSevereMood(moodAfter, 'CONCERNED');
    }
    const reasonCode: StudioReasonCode =
      repeatedPreparationFailure && input.outcome === 'FAIL'
        ? 'REPEATED_PREPARATION_FAILURE'
        : input.outcome === 'FAIL'
          ? sessionFailureStreak >= 2
            ? 'REPEATED_TRAINING_FAILURE'
            : 'NORMAL_FAILURE'
          : input.preparationStatus !== 'PREPARED'
            ? 'PREPARATION_GAP'
            : succeeded
              ? 'NORMAL_SUCCESS'
              : 'NEUTRAL_ATTEMPT';

    await client.query(
      `UPDATE ballet_madame_mood_states
       SET mood = $2, consecutive_failures = $3, preparation_gap_streak = $4,
           last_reason_code = $5, updated_at = $6
       WHERE discord_user_id = $1`,
      [
        input.discordUserId,
        moodAfter,
        Math.min(userFailureStreak, 20),
        Math.min(preparationGapStreak, 20),
        reasonCode,
        now,
      ],
    );

    const result: BalletStudioAttemptResult = {
      reactions: [...new Set(reactions)],
      mood: moodAfter,
      patience,
      maximumPatience: MADAME_STUDIO_RULES.maximumPatience,
      sessionEndedEarly,
      followup:
        assignedFollowup === null
          ? null
          : {
              extraWorkload: assignedFollowup.extra_workload,
              expiresAt: assignedFollowup.expires_at,
            },
      correctiveTask:
        assignedTask === null
          ? completedTask === null
            ? null
            : taskSnapshot(completedTask)
          : taskSnapshot(assignedTask),
    };
    await appendEvent(client, {
      eventKey: `attempt:${input.attemptId}:resolved`,
      discordUserId: input.discordUserId,
      classId: input.classId,
      attemptId: input.attemptId,
      eventType: 'ATTEMPT_RESOLVED',
      reasonCode,
      occurredAt: now,
      moodBefore,
      moodAfter,
      patienceBefore: session.patience,
      patienceAfter: patience,
      payload: resultToPayload(result),
    });
    return result;
  }

  public async loadAttemptResultWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    classId: string,
    attemptId: string,
  ): Promise<BalletStudioAttemptResult | null> {
    const result = await client.query<{ readonly event_payload: unknown }>(
      `SELECT event_payload FROM ballet_studio_events
       WHERE event_key = $1 AND discord_user_id = $2 AND class_id = $3::uuid AND attempt_id = $4::uuid`,
      [`attempt:${attemptId}:resolved`, discordUserId, classId, attemptId],
    );
    const payload = result.rows[0]?.event_payload;
    return payload === undefined ? null : parseResult(payload);
  }

  public async getWeeklyCard(
    discordUserId: string,
    training: BalletTrainingV3Snapshot,
  ): Promise<BalletWeeklyStudioCard> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockUser(client, discordUserId);
      await ensureMoodState(client, discordUserId);
      const now = await getDatabaseTime(client);
      await applyMoodDecay(client, discordUserId, now);
      await expireCorrectiveTasks(client, discordUserId, now);
      await expirePendingFollowups(client, discordUserId, now);
      const activeClass = await client.query<ActiveClassRow>(
        `SELECT class_id::text, status FROM ballet_classes
         WHERE discord_user_id = $1 AND status IN ('PREPARING', 'IN_PROGRESS')
         ORDER BY started_at DESC LIMIT 1`,
        [discordUserId],
      );
      const activeClassRow = activeClass.rows[0];
      if (activeClassRow !== undefined) {
        await this.ensureSessionWithinTransaction(
          client,
          discordUserId,
          activeClassRow.class_id,
          activeClassRow.status,
        );
      }
      const mood = await loadMood(client, discordUserId, false);
      const sessionResult = await client.query<SessionRow>(
        `SELECT s.patience, s.consecutive_failures, s.status
         FROM ballet_studio_session_states s
         JOIN ballet_classes c ON c.class_id = s.class_id
         WHERE s.discord_user_id = $1 AND s.status = 'ACTIVE'
           AND c.status IN ('PREPARING', 'IN_PROGRESS')
         ORDER BY s.updated_at DESC LIMIT 1`,
        [discordUserId],
      );
      const taskResult = await client.query<TaskRow>(
        `SELECT task_id::text, target_section, reason_code, created_at, due_at
         FROM ballet_corrective_tasks WHERE discord_user_id = $1 AND status = 'OPEN'
         ORDER BY due_at, task_id`,
        [discordUserId],
      );
      const followupResult = await client.query<FollowupRow>(
        `SELECT followup_id::text, extra_workload, expires_at
         FROM ballet_studio_followups WHERE discord_user_id = $1 AND status = 'PENDING'
         ORDER BY created_at LIMIT 1`,
        [discordUserId],
      );
      const cycle = training.staminaCycle;
      const conditionModifier = conditionScoreModifier(training.condition);
      const readiness: BalletStudioReadiness =
        conditionModifier >= 2
          ? 'FAVOURABLE'
          : conditionModifier >= -2
            ? 'BALANCED'
            : 'RECOVERY_FOCUSED';
      const tasks = taskResult.rows.map(taskSnapshot);
      const session = sessionResult.rows[0];
      const pendingFollowup = followupResult.rows[0];
      const warnings: BalletWeeklyStudioCard['warnings'][number][] = [];
      if (
        cycle !== null &&
        cycle.status === 'ACTIVE' &&
        cycle.completedWorkload < cycle.targetWorkload
      ) {
        warnings.push('PREPARATION_INCOMPLETE');
      }
      if (tasks.length > 0) warnings.push('CORRECTIVE_TASK_ACTIVE');
      if (training.setback.status === 'ACTIVE') warnings.push('FICTIONAL_SETBACK_ACTIVE');
      if (pendingFollowup !== undefined) warnings.push('FOLLOWUP_PENDING');
      if (session !== undefined && session.patience <= 1) warnings.push('PATIENCE_LOW');
      return {
        training,
        preparation: {
          target: cycle?.targetWorkload ?? null,
          completed: cycle?.completedWorkload ?? null,
          remaining:
            cycle === null ? null : Math.max(0, cycle.targetWorkload - cycle.completedWorkload),
          deadlineAt: cycle?.deadlineAt ?? null,
          timeRemainingMs:
            cycle === null ? null : Math.max(0, cycle.deadlineAt.getTime() - now.getTime()),
        },
        consistencyStamina: training.condition.consistencyStamina,
        readiness: { state: readiness, conditionModifier },
        mood: parseMood(mood.mood),
        patience:
          session === undefined
            ? null
            : {
                current: session.patience,
                maximum: MADAME_STUDIO_RULES.maximumPatience,
              },
        correctiveTasks: tasks,
        pendingFollowup:
          pendingFollowup === undefined
            ? null
            : {
                extraWorkload: pendingFollowup.extra_workload,
                expiresAt: pendingFollowup.expires_at,
              },
        warnings,
      };
    });
  }

  public async prepareCycleAdjustmentWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    baseTargetWorkload: number,
    now: Date,
  ): Promise<BalletStudioCycleAdjustment | null> {
    await expirePendingFollowups(client, discordUserId, now);
    const result = await client.query<FollowupRow>(
      `SELECT followup_id::text, extra_workload, expires_at FROM ballet_studio_followups
       WHERE discord_user_id = $1 AND status = 'PENDING' FOR UPDATE`,
      [discordUserId],
    );
    const followup = result.rows[0];
    if (followup === undefined) return null;
    if (followup.expires_at.getTime() <= now.getTime()) {
      await client.query(
        `UPDATE ballet_studio_followups SET status = 'EXPIRED'
         WHERE followup_id = $1::uuid AND status = 'PENDING'`,
        [followup.followup_id],
      );
      await appendEvent(client, {
        eventKey: `followup:${followup.followup_id}:expired`,
        discordUserId,
        followupId: followup.followup_id,
        eventType: 'FOLLOWUP_EXPIRED',
        reasonCode: 'FOLLOWUP_EXPIRED',
        occurredAt: now,
      });
      return null;
    }
    if (
      baseTargetWorkload > MADAME_STUDIO_RULES.maximumBaseTargetForFollowup ||
      baseTargetWorkload >= maximumCarryoverTarget
    ) {
      return null;
    }
    return {
      followupId: followup.followup_id,
      additionalWorkload: Math.min(
        followup.extra_workload,
        maximumCarryoverTarget - baseTargetWorkload,
      ),
    };
  }

  public async consumeCycleAdjustmentWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    cycleId: string,
    baseTargetWorkload: number,
    adjustment: BalletStudioCycleAdjustment | null,
    now: Date,
  ): Promise<void> {
    if (adjustment === null) return;
    const consumed = await client.query(
      `UPDATE ballet_studio_followups
       SET status = 'CONSUMED', consumed_at = $3, consumed_cycle_id = $4::uuid
       WHERE followup_id = $1::uuid AND discord_user_id = $2 AND status = 'PENDING'`,
      [adjustment.followupId, discordUserId, now, cycleId],
    );
    if (consumed.rowCount !== 1) throw new Error('Studio follow-up was not consumed exactly once.');
    await client.query(
      `INSERT INTO ballet_studio_cycle_adjustments
         (cycle_id, followup_id, discord_user_id, base_target_workload, added_workload, applied_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      [
        cycleId,
        adjustment.followupId,
        discordUserId,
        baseTargetWorkload,
        adjustment.additionalWorkload,
        now,
      ],
    );
    await appendEvent(client, {
      eventKey: `followup:${adjustment.followupId}:consumed`,
      discordUserId,
      followupId: adjustment.followupId,
      cycleId,
      eventType: 'FOLLOWUP_CONSUMED',
      reasonCode: 'FOLLOWUP_CONSUMED',
      occurredAt: now,
      payload: { baseTargetWorkload, addedWorkload: adjustment.additionalWorkload },
    });
  }

  public async recordRecoveryResolutionWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    setbackId: string,
    now: Date,
  ): Promise<void> {
    await ensureMoodState(client, discordUserId);
    await applyMoodDecay(client, discordUserId, now);
    const mood = await loadMood(client, discordUserId, true);
    const moodBefore = parseMood(mood.mood);
    const moodAfter = easeMood(moodBefore, 1);
    await client.query(
      `UPDATE ballet_madame_mood_states SET mood = $2, last_reason_code = $3, updated_at = $4
       WHERE discord_user_id = $1`,
      [discordUserId, moodAfter, 'FICTIONAL_SETBACK_RESOLVED', now],
    );
    await appendEvent(client, {
      eventKey: `setback:${setbackId}:resolved`,
      discordUserId,
      eventType: 'RECOVERY_RESOLVED',
      reasonCode: 'FICTIONAL_SETBACK_RESOLVED',
      occurredAt: now,
      moodBefore,
      moodAfter,
      payload: { setbackId },
    });
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
  if (locked.rows[0] === undefined) throw new Error('Studio user lock failed.');
}

async function ensureMoodState(client: PoolClient, discordUserId: string): Promise<void> {
  await client.query(
    `INSERT INTO ballet_madame_mood_states (discord_user_id)
     VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING`,
    [discordUserId],
  );
}

async function loadMood(
  client: PoolClient,
  discordUserId: string,
  forUpdate: boolean,
): Promise<MoodRow> {
  const result = await client.query<MoodRow>(
    `SELECT mood, consecutive_failures, preparation_gap_streak, updated_at
     FROM ballet_madame_mood_states WHERE discord_user_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [discordUserId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Madame mood state could not be loaded.');
  parseMood(row.mood);
  return row;
}

async function loadSession(
  client: PoolClient,
  discordUserId: string,
  classId: string,
  forUpdate: boolean,
): Promise<SessionRow> {
  const result = await client.query<SessionRow>(
    `SELECT patience, consecutive_failures, status FROM ballet_studio_session_states
     WHERE discord_user_id = $1 AND class_id = $2::uuid${forUpdate ? ' FOR UPDATE' : ''}`,
    [discordUserId, classId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Madame session state could not be loaded.');
  return row;
}

async function applyMoodDecay(client: PoolClient, discordUserId: string, now: Date): Promise<void> {
  const mood = await loadMood(client, discordUserId, true);
  const result = moodDecay(parseMood(mood.mood), mood.updated_at, now);
  if (result.steps === 0) return;
  await client.query(
    `UPDATE ballet_madame_mood_states
     SET mood = $2, consecutive_failures = CASE WHEN $2 = 'SUPPORTIVE' THEN 0 ELSE consecutive_failures END,
         preparation_gap_streak = CASE WHEN $2 = 'SUPPORTIVE' THEN 0 ELSE preparation_gap_streak END,
         last_reason_code = 'MOOD_DECAY', updated_at = $3
     WHERE discord_user_id = $1`,
    [discordUserId, result.mood, result.updatedAt],
  );
  await appendEvent(client, {
    eventKey: `mood:${discordUserId}:eased:${result.updatedAt.toISOString()}`,
    discordUserId,
    eventType: 'MOOD_EASED',
    reasonCode: 'MOOD_DECAY',
    occurredAt: result.updatedAt,
    moodBefore: parseMood(mood.mood),
    moodAfter: result.mood,
    payload: { steps: result.steps },
  });
}

async function expireCorrectiveTasks(
  client: PoolClient,
  discordUserId: string,
  now: Date,
): Promise<void> {
  const expired = await client.query<ExpiredTaskRow>(
    `UPDATE ballet_corrective_tasks
     SET status = 'EXPIRED'
     WHERE discord_user_id = $1 AND status = 'OPEN' AND due_at <= $2
     RETURNING task_id::text, source_class_id::text, source_attempt_id::text`,
    [discordUserId, now],
  );
  for (const task of expired.rows) {
    const mood = await loadMood(client, discordUserId, true);
    const moodBefore = parseMood(mood.mood);
    const moodAfter = moodAfterIgnoredCorrectiveTask(moodBefore);
    await client.query(
      `UPDATE ballet_madame_mood_states
       SET mood = $2, last_reason_code = 'CORRECTIVE_TASK_IGNORED', updated_at = $3
       WHERE discord_user_id = $1`,
      [discordUserId, moodAfter, now],
    );
    await appendEvent(client, {
      eventKey: `task:${task.task_id}:expired`,
      discordUserId,
      classId: task.source_class_id,
      attemptId: task.source_attempt_id,
      taskId: task.task_id,
      eventType: 'CORRECTIVE_EXPIRED',
      reasonCode: 'CORRECTIVE_TASK_IGNORED',
      occurredAt: now,
      moodBefore,
      moodAfter,
    });
    const followup = await assignFollowup(client, {
      discordUserId,
      reasonCode: 'CORRECTIVE_TASK_IGNORED',
      sourceAttemptId: null,
      sourceClassId: null,
      sourceTaskId: task.task_id,
      now,
    });
    if (followup !== null) {
      await appendEvent(client, {
        eventKey: `followup:${followup.followup_id}:assigned`,
        discordUserId,
        taskId: task.task_id,
        followupId: followup.followup_id,
        eventType: 'FOLLOWUP_ASSIGNED',
        reasonCode: 'CORRECTIVE_TASK_IGNORED',
        occurredAt: now,
        moodBefore,
        moodAfter,
        payload: { extraWorkload: followup.extra_workload },
      });
    }
  }
}

async function expirePendingFollowups(
  client: PoolClient,
  discordUserId: string,
  now: Date,
): Promise<void> {
  const expired = await client.query<{ readonly followup_id: string }>(
    `UPDATE ballet_studio_followups
     SET status = 'EXPIRED'
     WHERE discord_user_id = $1 AND status = 'PENDING' AND expires_at <= $2
     RETURNING followup_id::text`,
    [discordUserId, now],
  );
  for (const followup of expired.rows) {
    await appendEvent(client, {
      eventKey: `followup:${followup.followup_id}:expired`,
      discordUserId,
      followupId: followup.followup_id,
      eventType: 'FOLLOWUP_EXPIRED',
      reasonCode: 'FOLLOWUP_EXPIRED',
      occurredAt: now,
    });
  }
}

async function completeCorrectiveTask(
  client: PoolClient,
  input: BalletStudioAttemptInput,
  now: Date,
  succeeded: boolean,
): Promise<TaskRow | null> {
  if (!succeeded) return null;
  const selected = await client.query<TaskRow>(
    `SELECT task_id::text, target_section, reason_code, created_at, due_at
     FROM ballet_corrective_tasks
     WHERE discord_user_id = $1 AND status = 'OPEN' AND due_at > $2
       AND target_section = $3 AND source_attempt_id <> $4::uuid
     ORDER BY created_at, task_id LIMIT 1 FOR UPDATE`,
    [input.discordUserId, now, input.section, input.attemptId],
  );
  const task = selected.rows[0];
  if (task === undefined) return null;
  const updated = await client.query<TaskRow>(
    `UPDATE ballet_corrective_tasks
     SET status = 'COMPLETED', completed_at = $2, completed_class_id = $3::uuid,
         completed_attempt_id = $4::uuid
     WHERE task_id = $1::uuid AND status = 'OPEN'
     RETURNING task_id::text, target_section, reason_code, created_at, due_at`,
    [task.task_id, now, input.classId, input.attemptId],
  );
  return updated.rows[0] ?? null;
}

async function assignCorrectiveTask(
  client: PoolClient,
  input: BalletStudioAttemptInput,
  now: Date,
  repeatedPreparationFailure: boolean,
): Promise<TaskRow | null> {
  const active = await client.query(
    `SELECT task_id FROM ballet_corrective_tasks
     WHERE discord_user_id = $1 AND status = 'OPEN' FOR UPDATE`,
    [input.discordUserId],
  );
  if (active.rows[0] !== undefined) return null;
  const reasonCode = repeatedPreparationFailure
    ? 'REPEATED_PREPARATION_FAILURE'
    : 'REPEATED_TRAINING_FAILURE';
  const inserted = await client.query<TaskRow>(
    `INSERT INTO ballet_corrective_tasks
       (task_id, discord_user_id, task_type, target_section, reason_code, status,
        source_class_id, source_attempt_id, created_at, due_at)
     VALUES ($1::uuid, $2, 'SECTION_SUCCESS', $3, $4, 'OPEN', $5::uuid, $6::uuid,
             $7, $8)
     ON CONFLICT (source_attempt_id) DO NOTHING
     RETURNING task_id::text, target_section, reason_code, created_at, due_at`,
    [
      randomUUID(),
      input.discordUserId,
      input.section,
      reasonCode,
      input.classId,
      input.attemptId,
      now,
      new Date(now.getTime() + MADAME_STUDIO_RULES.correctiveTaskValidityDays * dayMs),
    ],
  );
  return inserted.rows[0] ?? null;
}

async function assignFollowup(
  client: PoolClient,
  input: {
    readonly discordUserId: string;
    readonly reasonCode: 'EARLY_SESSION_END' | 'CORRECTIVE_TASK_IGNORED';
    readonly sourceAttemptId: string | null;
    readonly sourceClassId: string | null;
    readonly sourceTaskId: string | null;
    readonly now: Date;
  },
): Promise<FollowupRow | null> {
  const inserted = await client.query<FollowupRow>(
    `INSERT INTO ballet_studio_followups
       (followup_id, discord_user_id, reason_code, source_attempt_id, source_class_id, source_task_id,
        extra_workload, status, created_at, expires_at)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7, 'PENDING', $8, $9)
     ON CONFLICT DO NOTHING
     RETURNING followup_id::text, extra_workload, expires_at`,
    [
      randomUUID(),
      input.discordUserId,
      input.reasonCode,
      input.sourceAttemptId,
      input.sourceClassId,
      input.sourceTaskId,
      MADAME_STUDIO_RULES.followupAdditionalWorkload,
      input.now,
      new Date(input.now.getTime() + MADAME_STUDIO_RULES.followupValidityDays * dayMs),
    ],
  );
  return inserted.rows[0] ?? null;
}

async function appendEvent(client: PoolClient, input: StudioEventInput): Promise<void> {
  await client.query(
    `INSERT INTO ballet_studio_events
       (event_id, event_key, discord_user_id, class_id, attempt_id, task_id, followup_id,
        cycle_id, event_type, reason_code, mood_before, mood_after, patience_before,
        patience_after, event_payload, occurred_at)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid,
             $9, $10, $11, $12, $13, $14, $15::jsonb, $16)
     ON CONFLICT (event_key) DO NOTHING`,
    [
      randomUUID(),
      input.eventKey,
      input.discordUserId,
      input.classId ?? null,
      input.attemptId ?? null,
      input.taskId ?? null,
      input.followupId ?? null,
      input.cycleId ?? null,
      input.eventType,
      input.reasonCode,
      input.moodBefore ?? null,
      input.moodAfter ?? null,
      input.patienceBefore ?? null,
      input.patienceAfter ?? null,
      JSON.stringify(input.payload ?? {}),
      input.occurredAt,
    ],
  );
}

async function getDatabaseTime(client: PoolClient): Promise<Date> {
  const result = await client.query<ClockRow>('SELECT clock_timestamp() AS now');
  const now = result.rows[0]?.now;
  if (now === undefined || Number.isNaN(now.getTime())) {
    throw new Error('Database did not return a valid Studio V2.2 timestamp.');
  }
  return now;
}

function parseMood(value: string): MadameMood {
  if ((MADAME_MOODS as readonly string[]).includes(value)) return value as MadameMood;
  throw new Error('Database returned an unknown Madame mood.');
}

function taskSnapshot(row: TaskRow): BalletStudioCorrectiveTask {
  if (
    row.reason_code !== 'REPEATED_TRAINING_FAILURE' &&
    row.reason_code !== 'REPEATED_PREPARATION_FAILURE'
  ) {
    throw new Error('Database returned an unknown corrective-task reason.');
  }
  return {
    taskId: row.task_id,
    taskType: 'SECTION_SUCCESS',
    targetSection: row.target_section as BalletStudioCorrectiveTask['targetSection'],
    reasonCode: row.reason_code,
    status: 'OPEN',
    createdAt: row.created_at,
    dueAt: row.due_at,
  };
}

function resultToPayload(result: BalletStudioAttemptResult): Readonly<Record<string, unknown>> {
  return {
    reactions: result.reactions,
    mood: result.mood,
    patience: result.patience,
    maximumPatience: result.maximumPatience,
    sessionEndedEarly: result.sessionEndedEarly,
    followup:
      result.followup === null
        ? null
        : {
            extraWorkload: result.followup.extraWorkload,
            expiresAt: result.followup.expiresAt.toISOString(),
          },
    correctiveTask:
      result.correctiveTask === null
        ? null
        : {
            ...result.correctiveTask,
            dueAt: result.correctiveTask.dueAt.toISOString(),
          },
  };
}

function parseResult(value: unknown): BalletStudioAttemptResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Persisted Studio V2.2 attempt result is invalid.');
  }
  const raw = value as Record<string, unknown>;
  const task = raw['correctiveTask'];
  const rawFollowup = raw['followup'] ?? null;
  let followup: BalletStudioAttemptResult['followup'] = null;
  if (rawFollowup !== null) {
    if (typeof rawFollowup !== 'object' || Array.isArray(rawFollowup)) {
      throw new Error('Persisted Studio V2.2 follow-up result is invalid.');
    }
    const followupValue = rawFollowup as Record<string, unknown>;
    if (
      !Number.isInteger(followupValue['extraWorkload']) ||
      (followupValue['extraWorkload'] as number) < 1 ||
      typeof followupValue['expiresAt'] !== 'string' ||
      !Number.isFinite(Date.parse(followupValue['expiresAt']))
    ) {
      throw new Error('Persisted Studio V2.2 follow-up result is invalid.');
    }
    followup = {
      extraWorkload: followupValue['extraWorkload'] as number,
      expiresAt: new Date(followupValue['expiresAt']),
    };
  }
  let correctiveTask: BalletStudioAttemptResult['correctiveTask'] = null;
  if (task !== null) {
    if (task === undefined || typeof task !== 'object' || Array.isArray(task)) {
      throw new Error('Persisted Studio V2.2 corrective-task result is invalid.');
    }
    const taskValue = task as Record<string, unknown>;
    if (
      typeof taskValue['taskId'] !== 'string' ||
      typeof taskValue['targetSection'] !== 'string' ||
      !(BALLET_CLASS_SECTIONS as readonly string[]).includes(taskValue['targetSection']) ||
      typeof taskValue['dueAt'] !== 'string' ||
      !Number.isFinite(Date.parse(taskValue['dueAt']))
    ) {
      throw new Error('Persisted Studio V2.2 corrective-task result is invalid.');
    }
    correctiveTask = {
      taskId: taskValue['taskId'],
      targetSection: taskValue[
        'targetSection'
      ] as BalletStudioAttemptResult['correctiveTask'] extends infer T
        ? T extends { readonly targetSection: infer S }
          ? S
          : never
        : never,
      dueAt: new Date(taskValue['dueAt']),
    };
  }
  if (
    typeof raw['mood'] !== 'string' ||
    !(MADAME_MOODS as readonly string[]).includes(raw['mood']) ||
    !Array.isArray(raw['reactions']) ||
    raw['reactions'].some(
      (reaction) =>
        typeof reaction !== 'string' ||
        !(STUDIO_REACTION_CODES as readonly string[]).includes(reaction),
    ) ||
    !Number.isInteger(raw['patience']) ||
    (raw['patience'] as number) < 0 ||
    (raw['patience'] as number) > MADAME_STUDIO_RULES.maximumPatience ||
    !Number.isInteger(raw['maximumPatience']) ||
    raw['maximumPatience'] !== MADAME_STUDIO_RULES.maximumPatience ||
    typeof raw['sessionEndedEarly'] !== 'boolean'
  ) {
    throw new Error('Persisted Studio V2.2 attempt result is invalid.');
  }
  return {
    reactions: raw['reactions'] as readonly StudioReactionCode[],
    mood: raw['mood'] as MadameMood,
    patience: raw['patience'] as number,
    maximumPatience: raw['maximumPatience'] as number,
    sessionEndedEarly: raw['sessionEndedEarly'],
    followup,
    correctiveTask,
  };
}
