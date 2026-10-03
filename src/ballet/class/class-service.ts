import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { ensureAcademyStageBaseline, loadBalletAcademyProgress } from '../academy-service.js';
import { IdempotencyConflictError } from '../../economy/errors.js';
import { assertDiscordSnowflake } from '../../utils/discord-snowflake.js';
import { withTransaction } from '../../database/transaction.js';
import { BALLET_STAT_KEYS } from '../types.js';
import type { BalletStats } from '../types.js';
import { buildBalletClassCurriculum, isBalletClassType } from './curriculum.js';
import { BalletClassNotFoundError, BalletClassStateError } from './errors.js';
import { evaluateBalletExercise } from './performance.js';
import { buildBalletClassReview } from './review.js';
import type {
  BalletClassAttempt,
  BalletClassAttemptResult,
  BalletClassCurriculumSnapshot,
  BalletClassPort,
  BalletClassStatus,
  BalletClassType,
  BalletClassView,
  BalletCorrectionCategory,
  BalletExerciseOutcome,
  BalletPreparationArea,
} from './types.js';
import {
  BALLET_CLASS_SECTIONS,
  BALLET_CORRECTION_CATEGORIES,
  BALLET_PREPARATION_AREAS,
} from './types.js';

interface ClassRow extends QueryResultRow {
  readonly class_id: string;
  readonly class_type: string;
  readonly academy_stage_id: string;
  readonly academy_stage_name: string;
  readonly status: string;
  readonly current_section: string | null;
  readonly started_at: Date;
  readonly completed_at: Date | null;
  readonly abandoned_at: Date | null;
  readonly current_exercise_index: number;
  readonly curriculum_snapshot: unknown;
  readonly review_snapshot: unknown | null;
}

interface ActionRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly class_id: string;
  readonly action_type: string;
  readonly request_fingerprint: string;
}

interface AttemptRow extends QueryResultRow {
  readonly attempt_id: string;
  readonly interaction_id: string;
  readonly exercise_id: string;
  readonly exercise_name: string;
  readonly section: string;
  readonly outcome: string;
  readonly score: number;
  readonly roll_micros: number;
  readonly skill_snapshot: unknown;
  readonly preparation_snapshot: string[];
  readonly attempted_at: Date;
  readonly correction_category: string | null;
  readonly correction_severity: number | null;
}

type ClassAction = 'START' | 'PREPARATION' | 'BEGIN' | 'ATTEMPT' | 'ABANDON';

const emptyStats: BalletStats = {
  technique: 0,
  flexibility: 0,
  musicality: 0,
  performance: 0,
  pointe: 0,
  stamina: 0,
};

export class BalletClassService implements BalletClassPort {
  public constructor(
    private readonly pool: Pool,
    private readonly random: () => number = Math.random,
  ) {}

  public async startOrResume(
    interactionId: string,
    discordUserId: string,
    classType: BalletClassType,
  ): Promise<BalletClassView> {
    assertIds(interactionId, discordUserId);
    if (!isBalletClassType(classType)) {
      throw new BalletClassStateError('That class type is not available.');
    }
    const requestFingerprint = fingerprint(discordUserId, 'START', classType);
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockUser(client, discordUserId);
      await ensureAcademyStageBaseline(client, discordUserId);
      const replay = await findAction(client, interactionId);
      if (replay !== undefined) {
        assertActionReplay(replay, discordUserId, 'START', requestFingerprint);
        return loadClassView(client, discordUserId, replay.class_id, true);
      }

      const active = await client.query<{ readonly class_id: string }>(
        "SELECT class_id::text FROM ballet_classes WHERE discord_user_id = $1 AND status IN ('PREPARING', 'IN_PROGRESS') FOR UPDATE",
        [discordUserId],
      );
      const activeClass = active.rows[0];
      if (activeClass !== undefined) {
        await recordAction(
          client,
          interactionId,
          discordUserId,
          activeClass.class_id,
          'START',
          requestFingerprint,
        );
        return loadClassView(client, discordUserId, activeClass.class_id, false);
      }

      await client.query(
        'INSERT INTO ballet_progress (discord_user_id) VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING',
        [discordUserId],
      );
      for (const statKey of BALLET_STAT_KEYS) {
        await client.query(
          'INSERT INTO ballet_stats (discord_user_id, stat_key) VALUES ($1, $2) ON CONFLICT (discord_user_id, stat_key) DO NOTHING',
          [discordUserId, statKey],
        );
      }

      const academy = await loadBalletAcademyProgress(client, discordUserId);
      const classId = randomUUID();
      const curriculum = buildBalletClassCurriculum(academy.currentRank.id, classType, classId);
      await client.query(
        "INSERT INTO ballet_classes (class_id, discord_user_id, start_interaction_id, class_type, academy_stage_id, academy_stage_name, status, current_exercise_index, curriculum_snapshot) VALUES ($1, $2, $3, $4, $5, $6, 'PREPARING', 0, $7::jsonb)",
        [
          classId,
          discordUserId,
          interactionId,
          classType,
          curriculum.academyStageId,
          curriculum.academyStageName,
          JSON.stringify(curriculum),
        ],
      );
      await recordAction(
        client,
        interactionId,
        discordUserId,
        classId,
        'START',
        requestFingerprint,
      );
      return loadClassView(client, discordUserId, classId, false);
    });
  }

  public async getClass(discordUserId: string, classId: string): Promise<BalletClassView> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    assertClassId(classId);
    return withTransaction(this.pool, async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      return loadClassView(client, discordUserId, classId, false);
    });
  }

  public async markPreparation(
    interactionId: string,
    discordUserId: string,
    classId: string,
    area: BalletPreparationArea,
  ): Promise<BalletClassView> {
    assertIds(interactionId, discordUserId);
    assertClassId(classId);
    if (!isPreparationArea(area))
      throw new BalletClassStateError('That preparation area is unavailable.');
    const requestFingerprint = fingerprint(discordUserId, 'PREPARATION', classId, area);
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockUser(client, discordUserId);
      const replay = await findAction(client, interactionId);
      if (replay !== undefined) {
        assertActionReplay(replay, discordUserId, 'PREPARATION', requestFingerprint);
        return loadClassView(client, discordUserId, replay.class_id, true);
      }

      const classRow = await lockClass(client, discordUserId, classId);
      if (classRow.status !== 'PREPARING') {
        throw new BalletClassStateError('Preparation can only be updated before class begins.');
      }
      await client.query(
        'INSERT INTO ballet_class_preparation (class_id, area, marked_interaction_id) VALUES ($1, $2, $3) ON CONFLICT (class_id, area) DO NOTHING',
        [classId, area, interactionId],
      );
      await recordAction(
        client,
        interactionId,
        discordUserId,
        classId,
        'PREPARATION',
        requestFingerprint,
      );
      return loadClassView(client, discordUserId, classId, false);
    });
  }

  public async begin(
    interactionId: string,
    discordUserId: string,
    classId: string,
  ): Promise<BalletClassView> {
    assertIds(interactionId, discordUserId);
    assertClassId(classId);
    const requestFingerprint = fingerprint(discordUserId, 'BEGIN', classId);
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockUser(client, discordUserId);
      const replay = await findAction(client, interactionId);
      if (replay !== undefined) {
        assertActionReplay(replay, discordUserId, 'BEGIN', requestFingerprint);
        return loadClassView(client, discordUserId, replay.class_id, true);
      }

      const classRow = await lockClass(client, discordUserId, classId);
      if (classRow.status === 'PREPARING') {
        await client.query(
          "UPDATE ballet_classes SET status = 'IN_PROGRESS', current_section = $2 WHERE class_id = $1",
          [classId, getCurriculum(classRow.curriculum_snapshot).exercises[0]?.section ?? 'BARRE'],
        );
      } else if (classRow.status !== 'IN_PROGRESS') {
        throw new BalletClassStateError('This class cannot be started in its current state.');
      }
      await recordAction(
        client,
        interactionId,
        discordUserId,
        classId,
        'BEGIN',
        requestFingerprint,
      );
      return loadClassView(client, discordUserId, classId, false);
    });
  }

  public async attempt(
    interactionId: string,
    discordUserId: string,
    classId: string,
    expectedExerciseId: string,
  ): Promise<BalletClassAttemptResult> {
    assertIds(interactionId, discordUserId);
    assertClassId(classId);
    const requestFingerprint = fingerprint(discordUserId, 'ATTEMPT', classId, expectedExerciseId);
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockUser(client, discordUserId);
      const replay = await findAction(client, interactionId);
      if (replay !== undefined) {
        assertActionReplay(replay, discordUserId, 'ATTEMPT', requestFingerprint);
        const classView = await loadClassView(client, discordUserId, replay.class_id, true);
        const attempt = classView.attempts.find((item) => item.interactionId === interactionId);
        return { class: classView, attempt: attempt ?? null, replayed: true };
      }

      const classRow = await lockClass(client, discordUserId, classId);
      if (classRow.status !== 'IN_PROGRESS') {
        throw new BalletClassStateError('Begin the class before attempting an exercise.');
      }
      const curriculum = getCurriculum(classRow.curriculum_snapshot);
      const exercise = curriculum.exercises[classRow.current_exercise_index];
      if (exercise === undefined)
        throw new BalletClassStateError('This class has no remaining exercises.');
      if (exercise.id !== expectedExerciseId) {
        throw new BalletClassStateError(
          'This exercise card is out of date. Refresh the class view.',
        );
      }

      const stats = await loadStats(client, discordUserId);
      const preparationResult = await client.query<{ readonly area: string }>(
        'SELECT area FROM ballet_class_preparation WHERE class_id = $1 ORDER BY area',
        [classId],
      );
      const preparation = new Set<BalletPreparationArea>(
        preparationResult.rows.map((row) => parsePreparationArea(row.area)),
      );
      const evaluation = evaluateBalletExercise(exercise, stats, preparation, this.random());
      const attemptId = randomUUID();
      await client.query(
        'INSERT INTO ballet_class_attempts (attempt_id, interaction_id, class_id, discord_user_id, position, exercise_id, exercise_name, section, outcome, score, roll_micros, skill_snapshot, preparation_snapshot, attempted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, clock_timestamp())',
        [
          attemptId,
          interactionId,
          classId,
          discordUserId,
          classRow.current_exercise_index,
          exercise.id,
          exercise.displayName,
          exercise.section,
          evaluation.outcome,
          evaluation.score,
          evaluation.rollMicros,
          JSON.stringify(stats),
          [...preparation],
        ],
      );
      if (evaluation.correction !== null) {
        await client.query(
          'INSERT INTO ballet_class_corrections (attempt_id, class_id, category, severity) VALUES ($1, $2, $3, $4)',
          [attemptId, classId, evaluation.correction.category, evaluation.correction.severity],
        );
      }

      const nextIndex = classRow.current_exercise_index + 1;
      const completed = nextIndex >= curriculum.exercises.length;
      await client.query(
        "UPDATE ballet_classes SET current_exercise_index = $2, current_section = $3, status = $4, completed_at = CASE WHEN $4 = 'COMPLETED' THEN clock_timestamp() ELSE NULL END WHERE class_id = $1",
        [
          classId,
          nextIndex,
          curriculum.exercises[nextIndex]?.section ?? exercise.section,
          completed ? 'COMPLETED' : 'IN_PROGRESS',
        ],
      );

      if (completed) {
        const attempts = await loadAttempts(client, classId);
        const review = buildBalletClassReview(curriculum, attempts);
        await client.query(
          'UPDATE ballet_classes SET review_snapshot = $2::jsonb WHERE class_id = $1',
          [classId, JSON.stringify(review)],
        );
        await recordTrainingEvidence(client, discordUserId, classId, curriculum, attempts);
      } else if (evaluation.outcome === 'PERFECT' || evaluation.outcome === 'SUCCESS') {
        await insertTrainingEvidence(
          client,
          discordUserId,
          classId,
          'EXERCISE_SUCCESS',
          exercise.id,
          null,
          attemptId,
        );
      }

      await recordAction(
        client,
        interactionId,
        discordUserId,
        classId,
        'ATTEMPT',
        requestFingerprint,
      );
      const classView = await loadClassView(client, discordUserId, classId, false);
      const attempt =
        classView.attempts.find((item) => item.interactionId === interactionId) ?? null;
      return { class: classView, attempt, replayed: false };
    });
  }

  public async abandon(
    interactionId: string,
    discordUserId: string,
    classId: string,
  ): Promise<BalletClassView> {
    assertIds(interactionId, discordUserId);
    assertClassId(classId);
    const requestFingerprint = fingerprint(discordUserId, 'ABANDON', classId);
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockUser(client, discordUserId);
      const replay = await findAction(client, interactionId);
      if (replay !== undefined) {
        assertActionReplay(replay, discordUserId, 'ABANDON', requestFingerprint);
        return loadClassView(client, discordUserId, replay.class_id, true);
      }

      const classRow = await lockClass(client, discordUserId, classId);
      if (classRow.status !== 'PREPARING' && classRow.status !== 'IN_PROGRESS') {
        throw new BalletClassStateError('Only an unfinished class can be left.');
      }
      await client.query(
        "UPDATE ballet_classes SET status = 'ABANDONED', abandoned_at = clock_timestamp() WHERE class_id = $1",
        [classId],
      );
      await recordAction(
        client,
        interactionId,
        discordUserId,
        classId,
        'ABANDON',
        requestFingerprint,
      );
      return loadClassView(client, discordUserId, classId, false);
    });
  }
}

async function ensureAndLockUser(client: PoolClient, discordUserId: string): Promise<void> {
  await client.query(
    'INSERT INTO discord_users (discord_user_id) VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING',
    [discordUserId],
  );
  const result = await client.query(
    'SELECT discord_user_id FROM discord_users WHERE discord_user_id = $1 FOR UPDATE',
    [discordUserId],
  );
  if (result.rows[0] === undefined)
    throw new Error('Discord user row could not be locked for Ballet class.');
}

async function lockClass(
  client: PoolClient,
  discordUserId: string,
  classId: string,
): Promise<ClassRow> {
  const result = await client.query<ClassRow>(
    'SELECT class_id::text, class_type, academy_stage_id, academy_stage_name, status, current_section, started_at, completed_at, abandoned_at, current_exercise_index, curriculum_snapshot, review_snapshot FROM ballet_classes WHERE discord_user_id = $1 AND class_id = $2::uuid FOR UPDATE',
    [discordUserId, classId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new BalletClassNotFoundError();
  return row;
}

async function findAction(
  client: PoolClient,
  interactionId: string,
): Promise<ActionRow | undefined> {
  const result = await client.query<ActionRow>(
    'SELECT discord_user_id, class_id::text, action_type, request_fingerprint FROM ballet_class_actions WHERE interaction_id = $1',
    [interactionId],
  );
  return result.rows[0];
}

function assertActionReplay(
  action: ActionRow,
  discordUserId: string,
  actionType: ClassAction,
  requestFingerprint: string,
): void {
  if (
    action.discord_user_id !== discordUserId ||
    action.action_type !== actionType ||
    action.request_fingerprint !== requestFingerprint
  ) {
    throw new IdempotencyConflictError();
  }
}

async function recordAction(
  client: PoolClient,
  interactionId: string,
  discordUserId: string,
  classId: string,
  actionType: ClassAction,
  requestFingerprint: string,
): Promise<void> {
  await client.query(
    'INSERT INTO ballet_class_actions (interaction_id, discord_user_id, class_id, action_type, request_fingerprint) VALUES ($1, $2, $3, $4, $5)',
    [interactionId, discordUserId, classId, actionType, requestFingerprint],
  );
}

async function loadClassView(
  client: PoolClient,
  discordUserId: string,
  classId: string,
  replayed: boolean,
): Promise<BalletClassView> {
  const result = await client.query<ClassRow>(
    'SELECT class_id::text, class_type, academy_stage_id, academy_stage_name, status, current_section, started_at, completed_at, abandoned_at, current_exercise_index, curriculum_snapshot, review_snapshot FROM ballet_classes WHERE discord_user_id = $1 AND class_id = $2::uuid',
    [discordUserId, classId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new BalletClassNotFoundError();
  const curriculum = getCurriculum(row.curriculum_snapshot);
  if (!isBalletClassStatus(row.status) || !isBalletClassTypeValue(row.class_type)) {
    throw new Error('Stored Ballet class contains an invalid state.');
  }
  const [preparationResult, attempts] = await Promise.all([
    client.query<{ readonly area: string }>(
      'SELECT area FROM ballet_class_preparation WHERE class_id = $1::uuid ORDER BY area',
      [classId],
    ),
    loadAttempts(client, classId),
  ]);
  return {
    classId: row.class_id,
    discordUserId,
    classType: row.class_type,
    classTypeName: curriculum.classTypeName,
    academyStageId: row.academy_stage_id,
    academyStageName: row.academy_stage_name,
    status: row.status,
    currentSection: row.current_section === null ? null : parseClassSection(row.current_section),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    abandonedAt: row.abandoned_at,
    currentExerciseIndex: row.current_exercise_index,
    curriculum,
    preparation: preparationResult.rows.map((item) => parsePreparationArea(item.area)),
    attempts,
    review: row.review_snapshot === null ? null : parseReview(row.review_snapshot),
    replayed,
  };
}

async function loadAttempts(client: PoolClient, classId: string): Promise<BalletClassAttempt[]> {
  const result = await client.query<AttemptRow>(
    'SELECT attempt.attempt_id::text, attempt.interaction_id, attempt.exercise_id, attempt.exercise_name, attempt.section, attempt.outcome, attempt.score, attempt.roll_micros, attempt.skill_snapshot, attempt.preparation_snapshot, attempt.attempted_at, correction.category AS correction_category, correction.severity AS correction_severity FROM ballet_class_attempts AS attempt LEFT JOIN ballet_class_corrections AS correction ON correction.attempt_id = attempt.attempt_id WHERE attempt.class_id = $1::uuid ORDER BY attempt.position',
    [classId],
  );
  return result.rows.map(parseAttempt);
}

function parseAttempt(row: AttemptRow): BalletClassAttempt {
  if (
    !isClassSection(row.section) ||
    !isExerciseOutcome(row.outcome) ||
    (row.correction_category === null) !== (row.correction_severity === null)
  ) {
    throw new Error('Stored Ballet class attempt contains an invalid result.');
  }
  const correction =
    row.correction_category === null
      ? null
      : {
          category: parseCorrectionCategory(row.correction_category),
          severity: row.correction_severity!,
        };
  return {
    attemptId: row.attempt_id,
    interactionId: row.interaction_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    section: row.section,
    outcome: row.outcome,
    score: row.score,
    rollMicros: row.roll_micros,
    correction,
    skillSnapshot: parseStats(row.skill_snapshot),
    preparationSnapshot: row.preparation_snapshot.map(parsePreparationArea),
    attemptedAt: row.attempted_at,
  };
}

async function loadStats(client: PoolClient, discordUserId: string): Promise<BalletStats> {
  const result = await client.query<{ readonly stat_key: string; readonly stat_value: number }>(
    'SELECT stat_key, stat_value FROM ballet_stats WHERE discord_user_id = $1 ORDER BY stat_key FOR SHARE',
    [discordUserId],
  );
  const stats: Record<string, number> = { ...emptyStats };
  for (const row of result.rows) {
    if (!(BALLET_STAT_KEYS as readonly string[]).includes(row.stat_key)) {
      throw new Error('Database returned an unknown Ballet stat.');
    }
    stats[row.stat_key] = row.stat_value;
  }
  return parseStats(stats);
}

async function recordTrainingEvidence(
  client: PoolClient,
  discordUserId: string,
  classId: string,
  curriculum: BalletClassCurriculumSnapshot,
  attempts: readonly BalletClassAttempt[],
): Promise<void> {
  await insertTrainingEvidence(client, discordUserId, classId, 'CLASS_COMPLETED', 'class', 'class');
  const sections = new Set(curriculum.sections.map((section) => section.id));
  for (const section of sections) {
    await insertTrainingEvidence(
      client,
      discordUserId,
      classId,
      'SECTION_COMPLETED',
      section,
      academyActivityForSection(section),
    );
  }
  for (const attempt of attempts) {
    if (attempt.outcome === 'PERFECT' || attempt.outcome === 'SUCCESS') {
      await insertTrainingEvidence(
        client,
        discordUserId,
        classId,
        'EXERCISE_SUCCESS',
        attempt.exerciseId,
        null,
        attempt.attemptId,
      );
    }
  }
}

async function insertTrainingEvidence(
  client: PoolClient,
  discordUserId: string,
  classId: string,
  evidenceType: 'CLASS_COMPLETED' | 'SECTION_COMPLETED' | 'EXERCISE_SUCCESS',
  evidenceCode: string,
  academyActivityCode: string | null,
  sourceAttemptId: string | null = null,
): Promise<void> {
  await client.query(
    'INSERT INTO academy_training_evidence (discord_user_id, class_id, evidence_type, evidence_code, academy_activity_code, source_attempt_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (discord_user_id, class_id, evidence_type, evidence_code) DO NOTHING',
    [discordUserId, classId, evidenceType, evidenceCode, academyActivityCode, sourceAttemptId],
  );
}

function academyActivityForSection(section: string): string | null {
  const codes: Readonly<Record<string, string>> = {
    BARRE: 'barre',
    CENTRE: 'center-practice',
    ADAGIO: 'center-practice',
    TURNS: 'center-practice',
    ALLEGRO: 'center-practice',
    TECHNIQUE: 'technique',
    CONDITIONING: 'stretching',
    REPERTOIRE: 'rehearsal',
  };
  return codes[section] ?? null;
}

function getCurriculum(value: unknown): BalletClassCurriculumSnapshot {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Stored Ballet class curriculum is invalid.');
  }
  const curriculum = value as Partial<BalletClassCurriculumSnapshot>;
  if (
    curriculum.version !== 1 ||
    typeof curriculum.academyStageId !== 'string' ||
    typeof curriculum.academyStageName !== 'string' ||
    !Array.isArray(curriculum.sections) ||
    !Array.isArray(curriculum.exercises) ||
    !isBalletClassTypeValue(curriculum.classType)
  ) {
    throw new Error('Stored Ballet class curriculum is invalid.');
  }
  return curriculum as BalletClassCurriculumSnapshot;
}

function parseReview(value: unknown): NonNullable<BalletClassView['review']> {
  if (typeof value !== 'object' || value === null)
    throw new Error('Stored Ballet class review is invalid.');
  const review = value as Partial<NonNullable<BalletClassView['review']>>;
  if (!Array.isArray(review.sections) || !Array.isArray(review.evidenceCodes)) {
    throw new Error('Stored Ballet class review is invalid.');
  }
  return review as NonNullable<BalletClassView['review']>;
}

function parseStats(value: unknown): BalletStats {
  if (typeof value !== 'object' || value === null)
    throw new Error('Stored Ballet stat snapshot is invalid.');
  const record = value as Record<string, unknown>;
  const stats = {} as Record<(typeof BALLET_STAT_KEYS)[number], number>;
  for (const key of BALLET_STAT_KEYS) {
    const stat = record[key];
    if (!Number.isInteger(stat) || (stat as number) < 0 || (stat as number) > 100) {
      throw new Error('Stored Ballet stat snapshot is invalid.');
    }
    stats[key] = stat as number;
  }
  return stats;
}

function fingerprint(discordUserId: string, ...parts: readonly string[]): string {
  return createHash('sha256')
    .update([discordUserId, ...parts].join('\u0000'))
    .digest('hex');
}

function assertIds(interactionId: string, discordUserId: string): void {
  assertDiscordSnowflake(interactionId, 'Discord interaction ID');
  assertDiscordSnowflake(discordUserId, 'Discord user ID');
}

function assertClassId(classId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) {
    throw new TypeError('Ballet class ID must be a UUID.');
  }
}

function isBalletClassTypeValue(value: unknown): value is BalletClassType {
  return (
    typeof value === 'string' &&
    [
      'REGULAR',
      'TECHNIQUE',
      'BARRE_FOCUS',
      'CENTRE_FOCUS',
      'TURNS',
      'ALLEGRO',
      'CONDITIONING',
      'REPERTOIRE',
      'ASSESSMENT_PREPARATION',
    ].includes(value)
  );
}

function isBalletClassStatus(value: string): value is BalletClassStatus {
  return (
    value === 'PREPARING' ||
    value === 'IN_PROGRESS' ||
    value === 'COMPLETED' ||
    value === 'ABANDONED'
  );
}

function isClassSection(value: string): value is (typeof BALLET_CLASS_SECTIONS)[number] {
  return (BALLET_CLASS_SECTIONS as readonly string[]).includes(value);
}

function parseClassSection(value: string): (typeof BALLET_CLASS_SECTIONS)[number] {
  if (!isClassSection(value)) throw new Error('Database returned an unknown Ballet class section.');
  return value;
}

function isExerciseOutcome(value: string): value is BalletExerciseOutcome {
  return value === 'PERFECT' || value === 'SUCCESS' || value === 'SHAKY' || value === 'FAIL';
}

function isPreparationArea(value: string): value is BalletPreparationArea {
  return (BALLET_PREPARATION_AREAS as readonly string[]).includes(value);
}

function parsePreparationArea(value: string): BalletPreparationArea {
  if (!isPreparationArea(value)) throw new Error('Database returned an unknown preparation area.');
  return value;
}

function parseCorrectionCategory(value: string): BalletCorrectionCategory {
  if (!(BALLET_CORRECTION_CATEGORIES as readonly string[]).includes(value)) {
    throw new Error('Database returned an unknown Ballet correction category.');
  }
  return value as BalletCorrectionCategory;
}
