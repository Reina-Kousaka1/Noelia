import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../../database/transaction.js';
import { IdempotencyConflictError } from '../../economy/errors.js';
import { assertDiscordSnowflake } from '../../utils/discord-snowflake.js';
import { ExpectedDomainError } from '../../utils/expected-domain-error.js';
import {
  academyStageStorageIds,
  canonicalAcademyStageId,
  getAcademyStageDefinition,
  getAcademyStageIndex,
  getBalletAcademyProgress,
} from '../academy.js';
import type { BalletAcademyEvidence } from '../academy.js';
import {
  ensureAcademyStageBaseline,
  ensureAndLockAcademyUser,
  loadBalletAcademyEvidence,
  loadBalletAcademyProgress,
} from '../academy-service.js';
import { BALLET_CORRECTION_CATEGORIES } from '../class/types.js';
import type {
  BalletClassReview,
  BalletClassReviewCorrection,
  BalletClassReviewSection,
  BalletSectionRating,
} from '../class/types.js';
import { buildAssessmentQuestions } from './assessment-content.js';
import { evaluateAcademyAssessmentEligibility } from './eligibility.js';
import { evaluateEarlyAcademyRequirements } from '../academy-gameplay.js';
import { loadEarlyAcademyEvidence } from '../academy-gameplay-service.js';
import { evaluateAcademyAssessmentResult } from './result.js';
import type {
  AcademyAssessmentAttemptView,
  AcademyAssessmentEligibility,
  AcademyAssessmentOverview,
  AcademyAssessmentPort,
  AcademyAssessmentQuestion,
  AcademyAssessmentQuestionSnapshot,
  AcademyAssessmentResult,
  AcademyAssessmentStatus,
} from './types.js';

interface AssessmentAttemptRow extends QueryResultRow {
  readonly attempt_id: string;
  readonly discord_user_id: string;
  readonly source_stage_id: string;
  readonly target_stage_id: string;
  readonly attempt_number: number;
  readonly practical_class_id: string;
  readonly practical_review_snapshot: unknown;
  readonly questions_snapshot: unknown;
  readonly result_snapshot: unknown | null;
  readonly status: string;
  readonly started_at: Date;
  readonly completed_at: Date | null;
}

interface AssessmentActionRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly attempt_id: string;
  readonly action_type: string;
  readonly request_fingerprint: string;
}

interface PracticalClassRow extends QueryResultRow {
  readonly class_id: string;
  readonly review_snapshot: unknown;
  readonly completed_at: Date;
}

interface FailureTimestampRow extends QueryResultRow {
  readonly completed_at: Date;
}

interface ResponseRow extends QueryResultRow {
  readonly question_id: string;
  readonly answer_id: string;
  readonly is_correct: boolean;
}

interface CountRow extends QueryResultRow {
  readonly response_count: number;
  readonly correct_count: number;
}

type AssessmentAction = 'START' | 'ANSWER';
type IdFactory = () => string;

export class AcademyAssessmentNotEligibleError extends ExpectedDomainError {
  public constructor() {
    super(
      'Academy assessment requirements are not complete.',
      'This Academy assessment is not ready yet. Review the listed requirements in /academy assessment.',
    );
    this.name = 'AcademyAssessmentNotEligibleError';
  }
}

export class AcademyAssessmentStateError extends ExpectedDomainError {
  public constructor(message: string, userMessage = message) {
    super(message, userMessage);
    this.name = 'AcademyAssessmentStateError';
  }
}

export class AcademyAssessmentService implements AcademyAssessmentPort {
  public constructor(
    private readonly pool: Pool,
    private readonly createId: IdFactory = randomUUID,
  ) {}

  public async getOverview(discordUserId: string): Promise<AcademyAssessmentOverview> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    return withTransaction(this.pool, async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const { evidence, persistedStageId } = await loadBalletAcademyEvidence(client, discordUserId);
      const progress =
        persistedStageId === null
          ? getBalletAcademyProgress(evidence)
          : await loadBalletAcademyProgress(client, discordUserId);
      const currentStageId = progress.currentRank.id;
      const targetStageId = progress.nextRank?.id ?? null;
      const activeRow = await loadAttemptRow(client, discordUserId, 'IN_PROGRESS');
      const latestRow = await loadLatestAttemptRow(client, discordUserId);
      const failureAt =
        targetStageId === null
          ? null
          : await loadLatestFailureAt(client, discordUserId, targetStageId);
      const practicalClass =
        targetStageId === null
          ? undefined
          : await loadPracticalClass(client, discordUserId, currentStageId, failureAt, false);
      const eligibility = await this.eligibility(
        client,
        discordUserId,
        currentStageId,
        evidence,
        practicalClass !== undefined,
        failureAt !== null,
      );

      return {
        currentStageId,
        currentStageName: progress.currentRank.title,
        targetStageId,
        targetStageName: progress.nextRank?.title ?? null,
        eligibility,
        activeAttempt:
          activeRow === undefined || (await isObsoleteAttempt(client, activeRow))
            ? null
            : await loadAttemptView(client, activeRow),
        latestAttempt: latestRow === undefined ? null : await loadAttemptView(client, latestRow),
      };
    });
  }

  public async start(
    interactionId: string,
    discordUserId: string,
  ): Promise<AcademyAssessmentAttemptView> {
    assertIds(interactionId, discordUserId);
    const requestFingerprint = fingerprint('START', discordUserId);
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockAcademyUser(client, discordUserId);
      const replay = await findAction(client, interactionId);
      if (replay !== undefined) {
        assertActionReplay(replay, discordUserId, 'START', requestFingerprint);
        return loadAttemptViewById(client, replay.attempt_id, discordUserId);
      }

      await ensureAcademyStageBaseline(client, discordUserId);
      const active = await loadAttemptRow(client, discordUserId, 'IN_PROGRESS', true);
      if (active !== undefined) {
        if (await isObsoleteAttempt(client, active)) {
          await retireObsoleteAttempt(client, active);
        } else {
          await recordAction(
            client,
            interactionId,
            discordUserId,
            active.attempt_id,
            'START',
            requestFingerprint,
          );
          return loadAttemptView(client, active);
        }
      }

      const { evidence } = await loadBalletAcademyEvidence(client, discordUserId);
      const progress = await loadBalletAcademyProgress(client, discordUserId);
      const targetStageId = progress.nextRank?.id;
      if (targetStageId === undefined) throw new AcademyAssessmentNotEligibleError();

      const failureAt = await loadLatestFailureAt(client, discordUserId, targetStageId);
      const practicalClass = await loadPracticalClass(
        client,
        discordUserId,
        progress.currentRank.id,
        failureAt,
        true,
      );
      const eligibility = await this.eligibility(
        client,
        discordUserId,
        progress.currentRank.id,
        evidence,
        practicalClass !== undefined,
        failureAt !== null,
      );
      if (!eligibility.eligible || practicalClass === undefined) {
        throw new AcademyAssessmentNotEligibleError();
      }

      const attemptNumber = await nextAttemptNumber(client, discordUserId, targetStageId);
      const questions = buildAssessmentQuestions(targetStageId, attemptNumber);
      const practicalReview = readBalletClassReview(practicalClass.review_snapshot);
      const attemptId = this.createId();
      const inserted = await client.query<AssessmentAttemptRow>(
        `INSERT INTO academy_assessment_attempts (
           attempt_id, discord_user_id, source_stage_id, target_stage_id, attempt_number,
           practical_class_id, practical_review_snapshot, questions_snapshot,
           status, start_interaction_id
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7::jsonb, $8::jsonb, 'IN_PROGRESS', $9)
         RETURNING attempt_id::text, discord_user_id, source_stage_id, target_stage_id,
                   attempt_number, practical_class_id::text, practical_review_snapshot,
                   questions_snapshot, result_snapshot, status, started_at, completed_at`,
        [
          attemptId,
          discordUserId,
          progress.currentRank.id,
          targetStageId,
          attemptNumber,
          practicalClass.class_id,
          JSON.stringify(practicalReview),
          JSON.stringify(questions),
          interactionId,
        ],
      );
      const attempt = inserted.rows[0];
      if (attempt === undefined) throw new Error('Academy assessment attempt was not created.');
      await recordAction(
        client,
        interactionId,
        discordUserId,
        attemptId,
        'START',
        requestFingerprint,
      );
      return loadAttemptView(client, attempt);
    });
  }

  public async answer(
    interactionId: string,
    discordUserId: string,
    attemptId: string,
    questionId: string,
    answerId: string,
  ): Promise<AcademyAssessmentAttemptView> {
    assertIds(interactionId, discordUserId);
    if (!isUuid(attemptId)) throw new AcademyAssessmentStateError('Assessment attempt is invalid.');
    if (
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(questionId) ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(answerId)
    ) {
      throw new AcademyAssessmentStateError('That Academy answer is no longer available.');
    }
    const requestFingerprint = fingerprint(
      'ANSWER',
      discordUserId,
      attemptId,
      questionId,
      answerId,
    );

    return withTransaction(this.pool, async (client) => {
      await ensureAndLockAcademyUser(client, discordUserId);
      const replay = await findAction(client, interactionId);
      if (replay !== undefined) {
        assertActionReplay(replay, discordUserId, 'ANSWER', requestFingerprint);
        return loadAttemptViewById(client, replay.attempt_id, discordUserId);
      }

      const attempt = await loadAttemptRowById(client, attemptId, discordUserId, true);
      if (attempt.status !== 'IN_PROGRESS') return loadAttemptView(client, attempt);
      if (await isObsoleteAttempt(client, attempt)) {
        await recordAction(
          client,
          interactionId,
          discordUserId,
          attemptId,
          'ANSWER',
          requestFingerprint,
        );
        await retireObsoleteAttempt(client, attempt);
        return loadAttemptViewById(client, attemptId, discordUserId);
      }
      const questions = readQuestionSnapshot(attempt.questions_snapshot);
      const responses = await loadResponses(client, attemptId);
      const answered = responses.find((response) => response.question_id === questionId);
      if (answered !== undefined) {
        if (answered.answer_id !== answerId) {
          throw new AcademyAssessmentStateError('This question has already been answered.');
        }
        await recordAction(
          client,
          interactionId,
          discordUserId,
          attemptId,
          'ANSWER',
          requestFingerprint,
        );
        return loadAttemptView(client, attempt);
      }

      const nextQuestion = questions[responses.length];
      if (nextQuestion === undefined || nextQuestion.id !== questionId) {
        throw new AcademyAssessmentStateError('Please answer the current Academy question first.');
      }
      if (!nextQuestion.answers.some((answer) => answer.id === answerId)) {
        throw new AcademyAssessmentStateError('That answer is not part of this question.');
      }

      await recordAction(
        client,
        interactionId,
        discordUserId,
        attemptId,
        'ANSWER',
        requestFingerprint,
      );
      await client.query(
        `INSERT INTO academy_assessment_responses (
           attempt_id, discord_user_id, question_id, interaction_id, answer_id, is_correct
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
        [
          attemptId,
          discordUserId,
          questionId,
          interactionId,
          answerId,
          answerId === nextQuestion.correctAnswerId,
        ],
      );

      const answerState = await client.query<CountRow>(
        `SELECT count(*)::integer AS response_count,
                count(*) FILTER (WHERE is_correct)::integer AS correct_count
         FROM academy_assessment_responses WHERE attempt_id = $1::uuid`,
        [attemptId],
      );
      const counts = answerState.rows[0];
      if (counts === undefined) throw new Error('Academy assessment answers could not be counted.');
      if (counts.response_count === questions.length) {
        await this.completeAttempt(client, attempt, counts.correct_count);
      }
      return loadAttemptViewById(client, attemptId, discordUserId);
    });
  }

  private async eligibility(
    client: PoolClient,
    discordUserId: string,
    currentStageId: string,
    evidence: BalletAcademyEvidence,
    hasPracticalClass: boolean,
    retakeRequiresNewClass: boolean,
  ): Promise<AcademyAssessmentEligibility> {
    const base = evaluateAcademyAssessmentEligibility(
      currentStageId,
      evidence,
      hasPracticalClass,
      retakeRequiresNewClass,
    );
    const targetStageId = base.targetStageId;
    if (targetStageId !== 'preparatory-dance' && targetStageId !== 'pre-primary') {
      return base;
    }
    const earlyEvidence = await loadEarlyAcademyEvidence(client, discordUserId, targetStageId);
    const requirements = [
      ...base.requirements,
      ...evaluateEarlyAcademyRequirements(targetStageId, earlyEvidence),
    ];
    return {
      ...base,
      requirements,
      eligible: requirements.every((requirement) => requirement.met),
    };
  }

  private async completeAttempt(
    client: PoolClient,
    attempt: AssessmentAttemptRow,
    correctAnswers: number,
  ): Promise<void> {
    const questions = readQuestionSnapshot(attempt.questions_snapshot);
    const review = readBalletClassReview(attempt.practical_review_snapshot);
    const completedAtResult = await client.query<{ readonly completed_at: Date }>(
      'SELECT clock_timestamp() AS completed_at',
    );
    const completedAt = completedAtResult.rows[0]?.completed_at;
    if (completedAt === undefined) throw new Error('Assessment completion time is unavailable.');
    const result = evaluateAcademyAssessmentResult(
      review,
      correctAnswers,
      questions.length,
      completedAt,
    );
    if (await isObsoleteAttempt(client, attempt)) {
      await retireObsoleteAttempt(client, attempt);
      return;
    }
    const status = result.status;

    await client.query(
      `UPDATE academy_assessment_attempts
       SET status = $2, result_snapshot = $3::jsonb, completed_at = $4
       WHERE attempt_id = $1::uuid AND status = 'IN_PROGRESS'`,
      [attempt.attempt_id, status, JSON.stringify(result), completedAt],
    );

    if (!result.promoted) return;

    const updated = await client.query(
      `UPDATE academy_stage_progress
       SET current_stage_id = $2, updated_at = $3
       WHERE discord_user_id = $1 AND current_stage_id = ANY($4::text[])`,
      [
        attempt.discord_user_id,
        canonicalAcademyStageId(attempt.target_stage_id),
        completedAt,
        academyStageStorageIds(attempt.source_stage_id),
      ],
    );
    if (updated.rowCount !== 1)
      throw new Error('Academy stage changed before assessment promotion.');
    await client.query(
      `INSERT INTO academy_assessment_promotions (
         attempt_id, discord_user_id, source_stage_id, target_stage_id, promoted_at
       ) VALUES ($1::uuid, $2, $3, $4, $5)`,
      [
        attempt.attempt_id,
        attempt.discord_user_id,
        attempt.source_stage_id,
        attempt.target_stage_id,
        completedAt,
      ],
    );
    await client.query(
      `INSERT INTO academy_training_evidence (
         discord_user_id, class_id, evidence_type, evidence_code,
         academy_activity_code, source_attempt_id
       ) VALUES ($1, $2::uuid, 'ASSESSMENT_PASSED', $3, NULL, NULL)
       ON CONFLICT (discord_user_id, class_id, evidence_type, evidence_code) DO NOTHING`,
      [
        attempt.discord_user_id,
        attempt.practical_class_id,
        `assessment-${attempt.target_stage_id}`,
      ],
    );
  }
}

async function loadAttemptRow(
  client: PoolClient,
  discordUserId: string,
  status: AcademyAssessmentStatus,
  forUpdate = false,
): Promise<AssessmentAttemptRow | undefined> {
  const result = await client.query<AssessmentAttemptRow>(
    `SELECT attempt_id::text, discord_user_id, source_stage_id, target_stage_id,
            attempt_number, practical_class_id::text, practical_review_snapshot,
            questions_snapshot, result_snapshot, status, started_at, completed_at
     FROM academy_assessment_attempts
     WHERE discord_user_id = $1 AND status = $2
     ORDER BY started_at DESC, attempt_id DESC LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [discordUserId, status],
  );
  return result.rows[0];
}

async function loadLatestAttemptRow(
  client: PoolClient,
  discordUserId: string,
): Promise<AssessmentAttemptRow | undefined> {
  const result = await client.query<AssessmentAttemptRow>(
    `SELECT attempt_id::text, discord_user_id, source_stage_id, target_stage_id,
            attempt_number, practical_class_id::text, practical_review_snapshot,
            questions_snapshot, result_snapshot, status, started_at, completed_at
     FROM academy_assessment_attempts
     WHERE discord_user_id = $1
     ORDER BY started_at DESC, attempt_id DESC LIMIT 1`,
    [discordUserId],
  );
  return result.rows[0];
}

async function loadAttemptRowById(
  client: PoolClient,
  attemptId: string,
  discordUserId: string,
  forUpdate = false,
): Promise<AssessmentAttemptRow> {
  const result = await client.query<AssessmentAttemptRow>(
    `SELECT attempt_id::text, discord_user_id, source_stage_id, target_stage_id,
            attempt_number, practical_class_id::text, practical_review_snapshot,
            questions_snapshot, result_snapshot, status, started_at, completed_at
     FROM academy_assessment_attempts
     WHERE attempt_id = $1::uuid AND discord_user_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [attemptId, discordUserId],
  );
  const row = result.rows[0];
  if (row === undefined)
    throw new AcademyAssessmentStateError('That Academy assessment is unavailable.');
  return row;
}

async function loadAttemptViewById(
  client: PoolClient,
  attemptId: string,
  discordUserId: string,
): Promise<AcademyAssessmentAttemptView> {
  return loadAttemptView(client, await loadAttemptRowById(client, attemptId, discordUserId));
}

async function loadAttemptView(
  client: PoolClient,
  row: AssessmentAttemptRow,
): Promise<AcademyAssessmentAttemptView> {
  const questions = readQuestionSnapshot(row.questions_snapshot);
  const responses = await loadResponses(client, row.attempt_id);
  const sourceStage = getAcademyStageDefinition(row.source_stage_id);
  const targetStage = getAcademyStageDefinition(row.target_stage_id);
  if (sourceStage === undefined || targetStage === undefined) {
    throw new Error('Assessment contains an unknown Academy stage.');
  }
  const currentQuestion = row.status === 'IN_PROGRESS' ? questions[responses.length] : undefined;
  const result = row.result_snapshot === null ? null : readAssessmentResult(row.result_snapshot);
  return {
    attemptId: row.attempt_id,
    sourceStageId: row.source_stage_id,
    sourceStageName: sourceStage.title,
    targetStageId: row.target_stage_id,
    targetStageName: targetStage.title,
    attemptNumber: row.attempt_number,
    status: parseAssessmentStatus(row.status),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    currentQuestionIndex: responses.length,
    totalQuestions: questions.length,
    currentQuestion: currentQuestion === undefined ? null : publicQuestion(currentQuestion),
    result,
  };
}

async function loadResponses(
  client: PoolClient,
  attemptId: string,
): Promise<readonly ResponseRow[]> {
  const result = await client.query<ResponseRow>(
    `SELECT question_id, answer_id, is_correct
     FROM academy_assessment_responses WHERE attempt_id = $1::uuid`,
    [attemptId],
  );
  return result.rows;
}

async function loadLatestFailureAt(
  client: PoolClient,
  discordUserId: string,
  targetStageId: string,
): Promise<Date | null> {
  const result = await client.query<FailureTimestampRow>(
    `SELECT completed_at FROM academy_assessment_attempts
     WHERE discord_user_id = $1 AND target_stage_id = ANY($2::text[])
       AND status = 'RETAKE_REQUIRED'
     ORDER BY completed_at DESC, attempt_id DESC LIMIT 1`,
    [discordUserId, academyStageStorageIds(targetStageId)],
  );
  return result.rows[0]?.completed_at ?? null;
}

async function loadPracticalClass(
  client: PoolClient,
  discordUserId: string,
  sourceStageId: string,
  after: Date | null,
  lock: boolean,
): Promise<PracticalClassRow | undefined> {
  const result = await client.query<PracticalClassRow>(
    `SELECT class_id::text, review_snapshot, completed_at
     FROM ballet_classes
     WHERE discord_user_id = $1 AND academy_stage_id = ANY($2::text[])
       AND status = 'COMPLETED' AND review_snapshot IS NOT NULL
       AND ($3::timestamptz IS NULL OR completed_at > $3)
     ORDER BY completed_at DESC, class_id DESC LIMIT 1${lock ? ' FOR SHARE' : ''}`,
    [discordUserId, academyStageStorageIds(sourceStageId), after],
  );
  return result.rows[0];
}

/** A saved attempt cannot promote across a stage inserted after it was started. */
async function isObsoleteAttempt(
  client: PoolClient,
  attempt: AssessmentAttemptRow,
): Promise<boolean> {
  const progress = await client.query<{ readonly current_stage_id: string }>(
    'SELECT current_stage_id FROM academy_stage_progress WHERE discord_user_id = $1',
    [attempt.discord_user_id],
  );
  const currentStageId = progress.rows[0]?.current_stage_id;
  if (currentStageId === undefined) throw new Error('Academy assessment has no stage baseline.');
  const source = canonicalAcademyStageId(attempt.source_stage_id);
  return (
    canonicalAcademyStageId(currentStageId) !== source ||
    getAcademyStageIndex(attempt.target_stage_id) !== getAcademyStageIndex(source) + 1
  );
}

/** Complete the saved attempt as a retake; its questions and responses remain intact. */
async function retireObsoleteAttempt(
  client: PoolClient,
  attempt: AssessmentAttemptRow,
): Promise<void> {
  const questions = readQuestionSnapshot(attempt.questions_snapshot);
  const review = readBalletClassReview(attempt.practical_review_snapshot);
  const timestamp = await client.query<{ readonly completed_at: Date }>(
    'SELECT clock_timestamp() AS completed_at',
  );
  const completedAt = timestamp.rows[0]?.completed_at;
  if (completedAt === undefined) throw new Error('Assessment completion time is unavailable.');
  const result = evaluateAcademyAssessmentResult(review, 0, questions.length, completedAt);
  await client.query(
    `UPDATE academy_assessment_attempts
     SET status = 'RETAKE_REQUIRED', result_snapshot = $2::jsonb, completed_at = $3
     WHERE attempt_id = $1::uuid AND status = 'IN_PROGRESS'`,
    [attempt.attempt_id, JSON.stringify(result), result.completedAt],
  );
}

async function nextAttemptNumber(
  client: PoolClient,
  discordUserId: string,
  targetStageId: string,
): Promise<number> {
  const result = await client.query<{ readonly next_number: number }>(
    `SELECT (COALESCE(max(attempt_number), 0) + 1)::integer AS next_number
     FROM academy_assessment_attempts
     WHERE discord_user_id = $1 AND target_stage_id = ANY($2::text[])`,
    [discordUserId, academyStageStorageIds(targetStageId)],
  );
  const number = result.rows[0]?.next_number;
  if (number === undefined) throw new Error('Assessment attempt sequence could not be calculated.');
  return number;
}

async function findAction(
  client: PoolClient,
  interactionId: string,
): Promise<AssessmentActionRow | undefined> {
  const result = await client.query<AssessmentActionRow>(
    `SELECT discord_user_id, attempt_id::text, action_type, request_fingerprint
     FROM academy_assessment_actions WHERE interaction_id = $1`,
    [interactionId],
  );
  return result.rows[0];
}

async function recordAction(
  client: PoolClient,
  interactionId: string,
  discordUserId: string,
  attemptId: string,
  action: AssessmentAction,
  requestFingerprint: string,
): Promise<void> {
  await client.query(
    `INSERT INTO academy_assessment_actions (
       interaction_id, discord_user_id, attempt_id, action_type, request_fingerprint
     ) VALUES ($1, $2, $3::uuid, $4, $5)`,
    [interactionId, discordUserId, attemptId, action, requestFingerprint],
  );
}

function assertActionReplay(
  action: AssessmentActionRow,
  discordUserId: string,
  expectedAction: AssessmentAction,
  requestFingerprint: string,
): void {
  if (
    action.discord_user_id !== discordUserId ||
    action.action_type !== expectedAction ||
    action.request_fingerprint !== requestFingerprint
  ) {
    throw new IdempotencyConflictError();
  }
}

function assertIds(interactionId: string, discordUserId: string): void {
  assertDiscordSnowflake(interactionId, 'Discord interaction ID');
  assertDiscordSnowflake(discordUserId, 'Discord user ID');
}

function fingerprint(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

function readQuestionSnapshot(value: unknown): readonly AcademyAssessmentQuestionSnapshot[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('Assessment question snapshot is invalid.');
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.domain !== 'string' ||
      typeof item.domainName !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.question !== 'string' ||
      typeof item.correctAnswerId !== 'string' ||
      typeof item.explanation !== 'string' ||
      !Array.isArray(item.answers)
    ) {
      throw new Error('Assessment question snapshot is invalid.');
    }
    const answers = item.answers.map((answer) => {
      if (!isRecord(answer) || typeof answer.id !== 'string' || typeof answer.label !== 'string') {
        throw new Error('Assessment answer snapshot is invalid.');
      }
      return { id: answer.id, label: answer.label };
    });
    if (!answers.some((answer) => answer.id === item.correctAnswerId)) {
      throw new Error('Assessment question has no matching correct answer.');
    }
    return {
      id: item.id,
      domain: item.domain as AcademyAssessmentQuestionSnapshot['domain'],
      domainName: item.domainName,
      title: item.title,
      question: item.question,
      answers,
      correctAnswerId: item.correctAnswerId,
      explanation: item.explanation,
    };
  });
}

function publicQuestion(question: AcademyAssessmentQuestionSnapshot): AcademyAssessmentQuestion {
  return {
    id: question.id,
    domain: question.domain,
    domainName: question.domainName,
    title: question.title,
    question: question.question,
    answers: question.answers,
  };
}

function readBalletClassReview(value: unknown): BalletClassReview {
  if (
    !isRecord(value) ||
    !Array.isArray(value.sections) ||
    typeof value.completedExercises !== 'number' ||
    typeof value.totalExercises !== 'number' ||
    !Array.isArray(value.evidenceCodes)
  ) {
    throw new Error('Saved Ballet class review is invalid.');
  }
  const sections: BalletClassReviewSection[] = value.sections.map((section) => {
    if (
      !isRecord(section) ||
      typeof section.section !== 'string' ||
      typeof section.displayName !== 'string' ||
      !isSectionRating(section.rating) ||
      typeof section.averageScore !== 'number' ||
      typeof section.completedExercises !== 'number'
    ) {
      throw new Error('Saved Ballet class section review is invalid.');
    }
    return {
      section: section.section as BalletClassReviewSection['section'],
      displayName: section.displayName,
      rating: section.rating,
      averageScore: section.averageScore,
      completedExercises: section.completedExercises,
    };
  });
  const readCorrection = (candidate: unknown): BalletClassReviewCorrection | null => {
    if (candidate === null) return null;
    if (
      !isRecord(candidate) ||
      typeof candidate.category !== 'string' ||
      !BALLET_CORRECTION_CATEGORIES.includes(
        candidate.category as (typeof BALLET_CORRECTION_CATEGORIES)[number],
      ) ||
      typeof candidate.count !== 'number' ||
      typeof candidate.severity !== 'number'
    ) {
      throw new Error('Saved Ballet class correction is invalid.');
    }
    return {
      category: candidate.category as BalletClassReviewCorrection['category'],
      count: candidate.count,
      severity: candidate.severity,
    };
  };
  const evidenceCodes = value.evidenceCodes.filter(
    (code): code is string => typeof code === 'string',
  );
  if (evidenceCodes.length !== value.evidenceCodes.length)
    throw new Error('Saved class evidence is invalid.');
  return {
    sections,
    completedExercises: value.completedExercises,
    totalExercises: value.totalExercises,
    primaryCorrection: readCorrection(value.primaryCorrection),
    secondaryCorrection: readCorrection(value.secondaryCorrection),
    evidenceCodes,
  };
}

function readAssessmentResult(value: unknown): AcademyAssessmentResult {
  if (
    !isRecord(value) ||
    (value.status !== 'PASS' &&
      value.status !== 'PASS_WITH_CORRECTIONS' &&
      value.status !== 'RETAKE_REQUIRED') ||
    typeof value.correctAnswers !== 'number' ||
    typeof value.totalQuestions !== 'number' ||
    !Array.isArray(value.practicalSections) ||
    typeof value.completedAt !== 'string' ||
    typeof value.promoted !== 'boolean'
  ) {
    throw new Error('Saved Academy assessment result is invalid.');
  }
  const review = readBalletClassReview({
    sections: value.practicalSections,
    completedExercises: 1,
    totalExercises: 1,
    primaryCorrection: value.primaryCorrection,
    secondaryCorrection: value.secondaryCorrection,
    evidenceCodes: [],
  });
  const completedAt = new Date(value.completedAt);
  if (Number.isNaN(completedAt.getTime()))
    throw new Error('Saved assessment completion time is invalid.');
  return {
    status: value.status,
    correctAnswers: value.correctAnswers,
    totalQuestions: value.totalQuestions,
    practicalSections: review.sections,
    primaryCorrection: review.primaryCorrection,
    secondaryCorrection: review.secondaryCorrection,
    completedAt,
    promoted: value.promoted,
  };
}

function parseAssessmentStatus(value: string): AcademyAssessmentStatus {
  if (
    value === 'IN_PROGRESS' ||
    value === 'PASS' ||
    value === 'PASS_WITH_CORRECTIONS' ||
    value === 'RETAKE_REQUIRED'
  ) {
    return value;
  }
  throw new Error('Database returned an invalid Academy assessment status.');
}

function isSectionRating(value: unknown): value is BalletSectionRating {
  return value === 'EXCELLENT' || value === 'GOOD' || value === 'NEEDS_ATTENTION';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
