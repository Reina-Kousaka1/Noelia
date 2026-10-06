import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AcademyAssessmentService,
  AcademyAssessmentNotEligibleError,
} from '../../src/ballet/assessment/assessment-service.js';
import { BalletAcademyService } from '../../src/ballet/academy-service.js';
import { BalletAcademyGameplayService } from '../../src/ballet/academy-gameplay-service.js';
import { buildAssessmentQuestions } from '../../src/ballet/assessment/assessment-content.js';
import { BalletClassService } from '../../src/ballet/class/class-service.js';
import { getAcademyStageDefinition } from '../../src/ballet/academy.js';
import { createIsolatedTestPool } from '../support/test-database.js';
import { runMigrations } from '../../src/database/migrations/runner.js';

const integrationDescribe = process.env.NOELIA_TEST_DATABASE_URL ? describe : describe.skip;
const discordEpochMs = 1_420_070_400_000n;

function interactionAt(date: Date): string {
  return (((BigInt(date.getTime()) - discordEpochMs) << 22n) | 1n).toString();
}

function utcClassTime(date: Date): { date: string; time: string; timeZone: string } {
  const minute = new Date(date);
  minute.setUTCSeconds(0, 0);
  return {
    date: minute.toISOString().slice(0, 10),
    time: minute.toISOString().slice(11, 16),
    timeZone: 'UTC',
  };
}

function testSnowflake(): string {
  const randomHex = randomUUID().replaceAll('-', '').slice(0, 15);
  return (BigInt(`0x${randomHex}`) + 1_000_000_000_000_000_000n).toString();
}

async function addCompletedClass(
  pool: Pool,
  discordUserId: string,
  stageId = 'pre-primary',
): Promise<string> {
  const classId = randomUUID();
  const review = {
    sections: [
      {
        section: 'BARRE',
        displayName: 'Barre',
        rating: 'EXCELLENT',
        averageScore: 95,
        completedExercises: 1,
      },
    ],
    completedExercises: 1,
    totalExercises: 1,
    primaryCorrection: null,
    secondaryCorrection: null,
    evidenceCodes: ['assessment-fixture-exercise'],
  };
  const curriculum = {
    version: 1,
    classType: 'REGULAR',
    classTypeName: 'Regular Ballet Class',
    academyStageId: stageId,
    academyStageName:
      stageId === 'minis-bambinis'
        ? 'Minis & Bambinis'
        : (getAcademyStageDefinition(stageId)?.title ?? stageId),
    sections: [],
    exercises: [],
  };
  await pool.query(
    `INSERT INTO ballet_classes (
       class_id, discord_user_id, start_interaction_id, class_type,
       academy_stage_id, academy_stage_name, status, current_exercise_index,
       curriculum_snapshot, review_snapshot, completed_at
     ) VALUES ($1::uuid, $2, $3, 'REGULAR', $4, $5,
               'COMPLETED', 0, $6::jsonb, $7::jsonb, clock_timestamp())`,
    [
      classId,
      discordUserId,
      testSnowflake(),
      stageId,
      curriculum.academyStageName,
      JSON.stringify(curriculum),
      JSON.stringify(review),
    ],
  );
  for (const activity of ['class', 'stretching', 'barre']) {
    await pool.query(
      `INSERT INTO academy_training_evidence (
         discord_user_id, class_id, evidence_type, evidence_code,
         academy_activity_code, source_attempt_id
       ) VALUES ($1, $2::uuid, 'CLASS_COMPLETED', $3, $4, NULL)`,
      [discordUserId, classId, `assessment-fixture-${activity}`, activity],
    );
  }
  return classId;
}

async function seedAssessmentReadyUser(
  pool: Pool,
  discordUserId: string,
  persistedStage = true,
): Promise<void> {
  await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [discordUserId]);
  await pool.query(
    `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
     VALUES ($1, 0, 3)`,
    [discordUserId],
  );
  await pool.query(
    `INSERT INTO ballet_stats (discord_user_id, stat_key, stat_value)
     VALUES ($1, 'technique', 2)`,
    [discordUserId],
  );
  if (persistedStage) {
    await pool.query(
      `INSERT INTO academy_stage_progress (
         discord_user_id, legacy_baseline_stage_id, current_stage_id
       ) VALUES ($1, 'pre-primary', 'pre-primary')`,
      [discordUserId],
    );
  }
  await addCompletedClass(pool, discordUserId);
}

async function completeEarlyAcademyPrerequisites(pool: Pool, discordUserId: string): Promise<void> {
  const wallClockMinute = new Date();
  wallClockMinute.setUTCSeconds(0, 0);
  const classTarget = new Date(wallClockMinute.getTime() - 60_000);
  let serviceClock = new Date(classTarget.getTime() - 30 * 60 * 1_000);
  const academy = new BalletAcademyService(pool);
  const gameplay = new BalletAcademyGameplayService(pool, academy, randomUUID, () => serviceClock);
  await gameplay.enroll(testSnowflake(), discordUserId);
  for (const action of [
    'CLAP_RHYTHM',
    'FIND_THE_BEAT',
    'WALK_TO_THE_BEAT',
    'FOLLOW_THE_MUSIC',
  ] as const) {
    await gameplay.completeBeginnerAction(testSnowflake(), discordUserId, action);
  }

  const booking = await gameplay.scheduleClass(
    testSnowflake(),
    discordUserId,
    testSnowflake(),
    utcClassTime(classTarget),
  );
  serviceClock = new Date(booking.checkInOpensAt.getTime() + 1_000);
  await gameplay.checkIn(interactionAt(serviceClock), discordUserId, booking.scheduledClassId);

  const classes = new BalletClassService(pool, () => 0.99);
  let view = await classes.startOrResume(testSnowflake(), discordUserId, 'REGULAR');
  view = await classes.begin(testSnowflake(), discordUserId, view.classId);
  while (view.status === 'IN_PROGRESS') {
    const exercise = view.curriculum.exercises[view.currentExerciseIndex];
    if (exercise === undefined) {
      throw new Error('Assessment readiness class stopped unexpectedly.');
    }
    view = (await classes.attempt(testSnowflake(), discordUserId, view.classId, exercise.id)).class;
  }
  if (view.status !== 'COMPLETED') {
    throw new Error('Assessment readiness requires one completed scheduled Academy class.');
  }

  const reportBook = await gameplay.getReportBook(discordUserId);
  expect(reportBook.enrolled).toBe(true);
  expect(reportBook.completedActions).toEqual(
    expect.arrayContaining([
      'CLAP_RHYTHM',
      'FIND_THE_BEAT',
      'WALK_TO_THE_BEAT',
      'FOLLOW_THE_MUSIC',
    ]),
  );
  expect(reportBook.academyComfort).toBeGreaterThanOrEqual(8);
  expect(reportBook.attendedCount).toBe(1);
  expect(
    reportBook.entries.some(
      (entry) => entry.status === 'ATTENDED' && (entry.grades?.overall ?? 6) <= 4,
    ),
  ).toBe(true);
}

integrationDescribe('Academy assessment isolated PostgreSQL integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIsolatedTestPool(process.env);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('starts once, survives a service restart, answers replay-safely, and promotes exactly one stage', async () => {
    const userId = testSnowflake();
    await seedAssessmentReadyUser(pool, userId);
    const service = new AcademyAssessmentService(pool);

    const overview = await service.getOverview(userId);
    expect(overview).toMatchObject({
      currentStageId: 'pre-primary',
      targetStageId: 'primary',
      eligibility: { eligible: true },
    });

    const startA = testSnowflake();
    const startB = testSnowflake();
    const [first, concurrent] = await Promise.all([
      service.start(startA, userId),
      service.start(startB, userId),
    ]);
    expect(first.attemptId).toBe(concurrent.attemptId);
    expect(first.status).toBe('IN_PROGRESS');
    expect(first.currentQuestion).not.toHaveProperty('correctAnswerId');

    const restartedService = new AcademyAssessmentService(pool);
    const resumed = await restartedService.getOverview(userId);
    expect(resumed.activeAttempt?.attemptId).toBe(first.attemptId);

    const question = buildAssessmentQuestions('primary', 1)[0]!;
    const answerInteraction = testSnowflake();
    const [completed, replayed] = await Promise.all([
      restartedService.answer(
        answerInteraction,
        userId,
        first.attemptId,
        question.id,
        question.correctAnswerId,
      ),
      restartedService.answer(
        answerInteraction,
        userId,
        first.attemptId,
        question.id,
        question.correctAnswerId,
      ),
    ]);
    expect(completed).toMatchObject({ status: 'PASS', result: { promoted: true } });
    expect(replayed).toEqual(completed);

    const persisted = await pool.query(
      `SELECT progress.current_stage_id,
              (SELECT count(*)::integer FROM academy_assessment_promotions
               WHERE discord_user_id = $1) AS promotion_count,
              (SELECT count(*)::integer FROM academy_training_evidence
               WHERE discord_user_id = $1 AND evidence_type = 'ASSESSMENT_PASSED') AS evidence_count
       FROM academy_stage_progress AS progress WHERE progress.discord_user_id = $1`,
      [userId],
    );
    expect(persisted.rows[0]).toMatchObject({
      current_stage_id: 'primary',
      promotion_count: 1,
      evidence_count: 1,
    });
    const next = await restartedService.getOverview(userId);
    expect(next.currentStageId).toBe('primary');
    expect(next.targetStageId).toBe('grade-1');
  });

  it('keeps a failed result, blocks refresh-until-pass, and requires fresh class evidence for a retake', async () => {
    const userId = testSnowflake();
    await seedAssessmentReadyUser(pool, userId);
    const service = new AcademyAssessmentService(pool);
    const first = await service.start(testSnowflake(), userId);
    const question = buildAssessmentQuestions('primary', 1)[0]!;
    const failed = await service.answer(
      testSnowflake(),
      userId,
      first.attemptId,
      question.id,
      question.answers.find((answer) => answer.id !== question.correctAnswerId)!.id,
    );
    expect(failed).toMatchObject({ status: 'RETAKE_REQUIRED', result: { promoted: false } });

    const blocked = await service.getOverview(userId);
    expect(blocked).toMatchObject({
      currentStageId: 'pre-primary',
      eligibility: { eligible: false, retakeRequiresNewClass: true },
    });
    await expect(service.start(testSnowflake(), userId)).rejects.toBeInstanceOf(
      AcademyAssessmentNotEligibleError,
    );

    await addCompletedClass(pool, userId);
    const retake = await service.start(testSnowflake(), userId);
    expect(retake.attemptNumber).toBe(2);
    expect(retake.attemptId).not.toBe(first.attemptId);
    const retakeQuestion = buildAssessmentQuestions('primary', 2)[0]!;
    const passed = await service.answer(
      testSnowflake(),
      userId,
      retake.attemptId,
      retakeQuestion.id,
      retakeQuestion.correctAnswerId,
    );
    expect(passed).toMatchObject({ status: 'PASS', result: { promoted: true } });

    const history = await pool.query(
      `SELECT status FROM academy_assessment_attempts
       WHERE discord_user_id = $1 ORDER BY attempt_number`,
      [userId],
    );
    expect(history.rows.map((row) => row.status)).toEqual(['RETAKE_REQUIRED', 'PASS']);
  });

  it('captures an existing evidence-derived stage as the immutable legacy baseline', async () => {
    const userId = testSnowflake();
    await seedAssessmentReadyUser(pool, userId, false);
    await new BalletClassService(pool).startOrResume(testSnowflake(), userId, 'REGULAR');
    const baseline = await pool.query(
      `SELECT legacy_baseline_stage_id, current_stage_id
       FROM academy_stage_progress WHERE discord_user_id = $1`,
      [userId],
    );
    expect(baseline.rows[0]).toEqual({
      legacy_baseline_stage_id: 'primary',
      current_stage_id: 'primary',
    });
  });

  it('maps a persisted Minis baseline to Pre-School Dance without losing evidence or history', async () => {
    const userId = testSnowflake();
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [userId]);
    await pool.query(
      `INSERT INTO ballet_progress (discord_user_id, total_xp, level)
       VALUES ($1, 0, 3)`,
      [userId],
    );
    await pool.query(
      `INSERT INTO ballet_stats (discord_user_id, stat_key, stat_value)
       VALUES ($1, 'technique', 2)`,
      [userId],
    );
    await pool.query(
      `INSERT INTO academy_stage_progress
         (discord_user_id, legacy_baseline_stage_id, current_stage_id)
       VALUES ($1, 'minis-bambinis', 'minis-bambinis')`,
      [userId],
    );
    const legacyClassId = await addCompletedClass(pool, userId, 'minis-bambinis');
    await completeEarlyAcademyPrerequisites(pool, userId);
    const classReview = await pool.query<{ readonly review_snapshot: unknown }>(
      'SELECT review_snapshot FROM ballet_classes WHERE class_id = $1::uuid',
      [legacyClassId],
    );
    const obsoleteAttemptId = randomUUID();
    await pool.query(
      `INSERT INTO academy_assessment_attempts
         (attempt_id, discord_user_id, source_stage_id, target_stage_id, attempt_number,
          practical_class_id, practical_review_snapshot, questions_snapshot, status,
          start_interaction_id)
       VALUES ($1::uuid, $2, 'minis-bambinis', 'pre-primary', 1, $3::uuid,
               $4::jsonb, $5::jsonb, 'IN_PROGRESS', $6)`,
      [
        obsoleteAttemptId,
        userId,
        legacyClassId,
        JSON.stringify(classReview.rows[0]!.review_snapshot),
        JSON.stringify(buildAssessmentQuestions('pre-primary', 1)),
        testSnowflake(),
      ],
    );
    const service = new AcademyAssessmentService(pool);
    expect(await service.getOverview(userId)).toMatchObject({
      currentStageId: 'pre-school-dance',
      targetStageId: 'preparatory-dance',
      eligibility: { eligible: true },
    });
    const [first, concurrent] = await Promise.all([
      service.start(testSnowflake(), userId),
      service.start(testSnowflake(), userId),
    ]);
    expect(first.attemptId).toBe(concurrent.attemptId);
    expect(first.sourceStageId).toBe('pre-school-dance');
    expect(first.targetStageId).toBe('preparatory-dance');
    const question = buildAssessmentQuestions('preparatory-dance', 1)[0]!;
    const passed = await service.answer(
      testSnowflake(),
      userId,
      first.attemptId,
      question.id,
      question.correctAnswerId,
    );
    expect(passed).toMatchObject({ status: 'PASS_WITH_CORRECTIONS', result: { promoted: true } });
    const persisted = await pool.query(
      `SELECT legacy_baseline_stage_id, current_stage_id FROM academy_stage_progress
       WHERE discord_user_id = $1`,
      [userId],
    );
    expect(persisted.rows[0]).toEqual({
      legacy_baseline_stage_id: 'minis-bambinis',
      current_stage_id: 'preparatory-dance',
    });
    const history = await pool.query(
      `SELECT target_stage_id, status FROM academy_assessment_attempts
       WHERE discord_user_id = $1 ORDER BY started_at, attempt_id`,
      [userId],
    );
    expect(history.rows).toEqual([
      { target_stage_id: 'pre-primary', status: 'RETAKE_REQUIRED' },
      { target_stage_id: 'preparatory-dance', status: 'PASS_WITH_CORRECTIONS' },
    ]);
    expect((await service.getOverview(userId)).targetStageId).toBe('pre-primary');
  });
});
