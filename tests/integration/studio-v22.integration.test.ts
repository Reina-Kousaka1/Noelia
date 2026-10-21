import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BalletClassService } from '../../src/ballet/class/class-service.js';
import { BalletStudioV22Service } from '../../src/ballet/studio-v22/studio-service.js';
import { BalletTrainingV3Service } from '../../src/ballet/training-v3/training-v3-service.js';
import { runMigrations, loadMigrations } from '../../src/database/migrations/runner.js';
import { createIsolatedTestPool } from '../support/test-database.js';

const integrationDescribe = process.env.NOELIA_TEST_DATABASE_URL ? describe : describe.skip;

function testSnowflake(): string {
  return (
    BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 15)}`) + 1_000_000_000_000_000_000n
  ).toString();
}

integrationDescribe('isolated Studio V2.2 PostgreSQL integration', () => {
  let adminPool: Pool;
  let pool: Pool;
  let schemaName: string;

  beforeAll(async () => {
    adminPool = createIsolatedTestPool(process.env);
    schemaName = `noelia_test_${randomUUID().replaceAll('-', '')}`;
    await adminPool.query(`CREATE SCHEMA ${schemaName}`);
    pool = createIsolatedTestPool(process.env, schemaName);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool?.end();
    if (adminPool !== undefined) {
      if (schemaName !== undefined) await adminPool.query(`DROP SCHEMA ${schemaName} CASCADE`);
      await adminPool.end();
    }
  });

  it('upgrades a populated V27 schema exactly once and preserves its existing V2.1 rows', async () => {
    const isolatedSchema = `noelia_test_${randomUUID().replaceAll('-', '')}`;
    await adminPool.query(`CREATE SCHEMA ${isolatedSchema}`);
    const upgradePool = createIsolatedTestPool(process.env, isolatedSchema);
    const before028Directory = await mkdtemp(join(tmpdir(), 'noelia-migrations-027-'));
    const migrations = await loadMigrations(resolve(process.cwd(), 'migrations'));
    const userId = testSnowflake();
    const cycleId = randomUUID();
    const classId = randomUUID();
    const attemptId = randomUUID();

    try {
      for (const migration of migrations.slice(0, 27)) {
        await writeFile(
          join(
            before028Directory,
            `${String(migration.version).padStart(3, '0')}_${migration.name}.sql`,
          ),
          migration.sql,
          { flag: 'wx' },
        );
      }
      await expect(runMigrations(upgradePool, before028Directory)).resolves.toEqual({
        appliedCount: 27,
        currentVersion: 27,
      });
      await upgradePool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [userId]);
      await upgradePool.query(
        `INSERT INTO academy_stage_progress
           (discord_user_id, legacy_baseline_stage_id, current_stage_id)
         VALUES ($1, 'pre-primary', 'pre-primary')`,
        [userId],
      );
      await upgradePool.query(
        `INSERT INTO ballet_training_condition
           (discord_user_id, energy, nutrition, fatigue, sleep_debt, consistency_stamina)
         VALUES ($1, 61, 74, 28, 5, 108)`,
        [userId],
      );
      await upgradePool.query(
        `INSERT INTO ballet_stamina_cycles
           (cycle_id, discord_user_id, cycle_number, target_workload, completed_workload,
            status, deadline_at, duration_days)
         VALUES ($1, $2, 1, 20, 7, 'ACTIVE', clock_timestamp() + interval '7 days', 7)`,
        [cycleId, userId],
      );
      await upgradePool.query(
        `INSERT INTO ballet_classes
           (class_id, discord_user_id, start_interaction_id, class_type, academy_stage_id,
            academy_stage_name, status, curriculum_snapshot)
         VALUES ($1, $2, $3, 'REGULAR', 'pre-primary', 'Pre-Primary', 'PREPARING',
                 '{"version":"1","sections":[],"exercises":[]}'::jsonb)`,
        [classId, userId, testSnowflake()],
      );
      await upgradePool.query(
        `INSERT INTO ballet_class_attempts
           (attempt_id, interaction_id, class_id, discord_user_id, position, exercise_id,
            exercise_name, section, outcome, score, roll_micros, skill_snapshot,
            preparation_snapshot)
         VALUES ($1, $2, $3, $4, 0, 'legacy-barre', 'Legacy Barre', 'BARRE', 'SUCCESS',
                 82, 500000, '{}'::jsonb, ARRAY['BALANCE']::text[])`,
        [attemptId, testSnowflake(), classId, userId],
      );
      const checksumsBefore = await upgradePool.query(
        'SELECT version, name, checksum FROM noelia_schema_migrations ORDER BY version',
      );

      await expect(runMigrations(upgradePool)).resolves.toEqual({
        appliedCount: 1,
        currentVersion: 28,
      });
      await expect(
        upgradePool.query(
          `SELECT current_stage_id FROM academy_stage_progress WHERE discord_user_id = $1`,
          [userId],
        ),
      ).resolves.toMatchObject({ rows: [{ current_stage_id: 'pre-primary' }] });
      await expect(
        upgradePool.query(
          `SELECT energy, nutrition, fatigue, sleep_debt, consistency_stamina
           FROM ballet_training_condition WHERE discord_user_id = $1`,
          [userId],
        ),
      ).resolves.toMatchObject({
        rows: [{ energy: 61, nutrition: 74, fatigue: 28, sleep_debt: 5, consistency_stamina: 108 }],
      });
      await expect(
        upgradePool.query(
          `SELECT target_workload, completed_workload FROM ballet_stamina_cycles
           WHERE cycle_id = $1`,
          [cycleId],
        ),
      ).resolves.toMatchObject({ rows: [{ target_workload: 20, completed_workload: 7 }] });
      await expect(
        upgradePool.query(
          'SELECT count(*)::integer AS count FROM ballet_class_attempts WHERE attempt_id = $1',
          [attemptId],
        ),
      ).resolves.toMatchObject({ rows: [{ count: 1 }] });
      const checksumRowsAfter = await upgradePool.query(
        'SELECT version, name, checksum FROM noelia_schema_migrations ORDER BY version',
      );
      expect(checksumRowsAfter.rows.slice(0, 27)).toEqual(checksumsBefore.rows);
      await expect(runMigrations(upgradePool)).resolves.toEqual({
        appliedCount: 0,
        currentVersion: 28,
      });
    } finally {
      await upgradePool.end();
      await adminPool.query(`DROP SCHEMA ${isolatedSchema} CASCADE`);
      await rm(before028Directory, { recursive: true, force: true });
    }
  }, 30_000);

  it('persists session patience, corrective escalation, early end, replay results, and one-time follow-up workload', async () => {
    const userId = testSnowflake();
    const studio = new BalletStudioV22Service(pool);
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [userId]);
    await pool.query(
      `INSERT INTO academy_stage_progress
         (discord_user_id, legacy_baseline_stage_id, current_stage_id)
       VALUES ($1, 'solo-seal', 'solo-seal')`,
      [userId],
    );
    const failingClasses = new BalletClassService(pool, () => 0, undefined, studio);
    let view = await failingClasses.startOrResume(testSnowflake(), userId, 'REGULAR');
    await pool.query(`UPDATE ballet_stats SET stat_value = 100 WHERE discord_user_id = $1`, [
      userId,
    ]);
    view = await failingClasses.begin(testSnowflake(), userId, view.classId);
    const results = [];
    for (let index = 0; index < 4; index += 1) {
      const exercise = view.curriculum.exercises[view.currentExerciseIndex];
      if (exercise === undefined) throw new Error('Expected another exercise before early end.');
      const result = await failingClasses.attempt(
        testSnowflake(),
        userId,
        view.classId,
        exercise.id,
      );
      results.push(result);
      view = result.class;
    }

    expect(results.map((result) => result.attempt?.outcome)).toEqual([
      'FAIL',
      'FAIL',
      'FAIL',
      'FAIL',
    ]);
    expect(results[1]?.studioReaction?.reactions).toContain('CORRECTIVE_ASSIGNED');
    expect(results[3]?.studioReaction).toMatchObject({
      sessionEndedEarly: true,
      patience: 0,
      mood: 'FRUSTRATED',
      followup: { extraWorkload: 2 },
    });
    await expect(
      pool.query(
        `SELECT count(*)::integer AS count FROM ballet_studio_events
         WHERE discord_user_id = $1 AND event_type = 'FOLLOWUP_ASSIGNED'`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
    expect(view.status).toBe('ABANDONED');
    await expect(
      pool.query(
        `SELECT count(*)::integer AS count FROM academy_training_evidence WHERE class_id = $1`,
        [view.classId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });

    const finalAttempt = results[3];
    const finalAttemptInteractionId = finalAttempt?.attempt?.interactionId;
    const finalExerciseId = finalAttempt?.attempt?.exerciseId;
    if (finalAttemptInteractionId === undefined || finalExerciseId === undefined) {
      throw new Error('Expected the final failed attempt to be persisted.');
    }
    const beforeReplay = await pool.query(
      `SELECT count(*)::integer AS count FROM ballet_studio_events
       WHERE discord_user_id = $1 AND event_type = 'ATTEMPT_RESOLVED'`,
      [userId],
    );
    const replayed = await failingClasses.attempt(
      finalAttemptInteractionId,
      userId,
      view.classId,
      finalExerciseId,
    );
    expect(replayed.replayed).toBe(true);
    expect(replayed.studioReaction).toEqual(finalAttempt?.studioReaction);
    await expect(
      pool.query(
        `SELECT count(*)::integer AS count FROM ballet_studio_events
         WHERE discord_user_id = $1 AND event_type = 'ATTEMPT_RESOLVED'`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: beforeReplay.rows[0]?.count }] });
    await expect(
      pool.query(
        `SELECT count(*)::integer AS open_count FROM ballet_corrective_tasks
         WHERE discord_user_id = $1 AND status = 'OPEN'`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ open_count: 1 }] });

    const successfulClasses = new BalletClassService(pool, () => 0.999, undefined, studio);
    let nextClass = await successfulClasses.startOrResume(testSnowflake(), userId, 'REGULAR');
    for (const area of [
      'GENERAL_WARM_UP',
      'MOBILITY',
      'CORE_ACTIVATION',
      'BALANCE',
      'BARRE',
      'TURNS',
      'JUMPS',
    ] as const) {
      nextClass = await successfulClasses.markPreparation(
        testSnowflake(),
        userId,
        nextClass.classId,
        area,
      );
    }
    nextClass = await successfulClasses.begin(testSnowflake(), userId, nextClass.classId);
    const nextExercise = nextClass.curriculum.exercises[nextClass.currentExerciseIndex];
    if (nextExercise === undefined) throw new Error('Expected a new class exercise.');
    const correctiveResult = await successfulClasses.attempt(
      testSnowflake(),
      userId,
      nextClass.classId,
      nextExercise.id,
    );
    expect(correctiveResult.attempt?.outcome).toMatch(/^(SUCCESS|PERFECT)$/);
    expect(correctiveResult.studioReaction?.reactions).toContain('CORRECTIVE_COMPLETED');
    expect(correctiveResult.studioReaction?.patience).toBe(3);
    await expect(
      pool.query(
        `SELECT status, completed_at FROM ballet_corrective_tasks WHERE discord_user_id = $1`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ status: 'COMPLETED' }] });

    const training = new BalletTrainingV3Service(pool, () => 0.5, undefined, studio);
    const snapshot = await training.getSnapshot(userId);
    expect(snapshot.staminaCycle?.targetWorkload).toBe(22);
    const activeCycle = await pool.query<{ readonly cycle_id: string }>(
      `SELECT cycle_id::text FROM ballet_stamina_cycles
       WHERE discord_user_id = $1 AND status = 'ACTIVE'`,
      [userId],
    );
    const cycleId = activeCycle.rows[0]?.cycle_id;
    if (cycleId === undefined) throw new Error('Expected an active preparation period.');
    await expect(
      pool.query(
        `SELECT status, extra_workload FROM ballet_studio_followups WHERE discord_user_id = $1`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ status: 'CONSUMED', extra_workload: 2 }] });
    await expect(
      pool.query(
        `SELECT base_target_workload, added_workload FROM ballet_studio_cycle_adjustments
         WHERE cycle_id = $1`,
        [cycleId],
      ),
    ).resolves.toMatchObject({ rows: [{ base_target_workload: 20, added_workload: 2 }] });
    const secondSnapshot = await training.getSnapshot(userId);
    expect(secondSnapshot.staminaCycle?.targetWorkload).toBe(22);
    await expect(
      pool.query(
        `SELECT count(*)::integer AS count FROM ballet_studio_cycle_adjustments
         WHERE followup_id IN (SELECT followup_id FROM ballet_studio_followups WHERE discord_user_id = $1)`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
    const card = await new BalletStudioV22Service(pool).getWeeklyCard(userId, secondSnapshot);
    expect(card.mood).toBe('STERN');
    expect(card.preparation.target).toBe(22);
    expect(card.pendingFollowup).toBeNull();
    expect(card.correctiveTasks).toHaveLength(0);
  }, 30_000);

  it('serializes concurrent duplicate class interactions and avoids duplicate Studio events', async () => {
    const userId = testSnowflake();
    const studio = new BalletStudioV22Service(pool);
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [userId]);
    await pool.query(
      `INSERT INTO academy_stage_progress
         (discord_user_id, legacy_baseline_stage_id, current_stage_id)
       VALUES ($1, 'solo-seal', 'solo-seal')`,
      [userId],
    );
    let randomCalls = 0;
    const service = new BalletClassService(
      pool,
      () => {
        randomCalls += 1;
        return 0;
      },
      undefined,
      studio,
    );
    let view = await service.startOrResume(testSnowflake(), userId, 'BARRE_FOCUS');
    view = await service.begin(testSnowflake(), userId, view.classId);
    const exercise = view.curriculum.exercises[0];
    if (exercise === undefined) throw new Error('Expected a Barre exercise.');
    const interactionId = testSnowflake();
    const [first, replay] = await Promise.all([
      service.attempt(interactionId, userId, view.classId, exercise.id),
      service.attempt(interactionId, userId, view.classId, exercise.id),
    ]);
    expect([first.replayed, replay.replayed].toSorted()).toEqual([false, true]);
    expect(randomCalls).toBe(2);
    await expect(
      pool.query(
        `SELECT count(*)::integer AS attempts FROM ballet_class_attempts WHERE class_id = $1`,
        [view.classId],
      ),
    ).resolves.toMatchObject({ rows: [{ attempts: 1 }] });
    await expect(
      pool.query(
        `SELECT count(*)::integer AS events FROM ballet_studio_events
         WHERE discord_user_id = $1 AND event_type = 'ATTEMPT_RESOLVED'`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ events: 1 }] });
  }, 30_000);

  it('does not add the follow-up to a high-target period above the fair-use threshold', async () => {
    const userId = testSnowflake();
    const studio = new BalletStudioV22Service(pool);
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [userId]);
    await pool.query(
      `INSERT INTO academy_stage_progress
         (discord_user_id, legacy_baseline_stage_id, current_stage_id)
       VALUES ($1, 'solo-seal', 'solo-seal')`,
      [userId],
    );
    const classes = new BalletClassService(pool, () => 0, undefined, studio);
    let view = await classes.startOrResume(testSnowflake(), userId, 'REGULAR');
    await pool.query('UPDATE ballet_stats SET stat_value = 100 WHERE discord_user_id = $1', [
      userId,
    ]);
    view = await classes.begin(testSnowflake(), userId, view.classId);
    for (let index = 0; index < 4; index += 1) {
      const exercise = view.curriculum.exercises[view.currentExerciseIndex];
      if (exercise === undefined) throw new Error('Expected an exercise before the early end.');
      view = (await classes.attempt(testSnowflake(), userId, view.classId, exercise.id)).class;
    }
    await pool.query(
      `INSERT INTO ballet_stamina_cycles
         (cycle_id, discord_user_id, cycle_number, target_workload, completed_workload,
          status, deadline_at, duration_days)
       VALUES ($1, $2, 1, 41, 0, 'ACTIVE', clock_timestamp() - interval '1 second', 21)`,
      [randomUUID(), userId],
    );

    const training = new BalletTrainingV3Service(pool, () => 0.5, undefined, studio);
    const snapshot = await training.getSnapshot(userId);
    expect(snapshot.staminaCycle?.targetWorkload).toBe(42);
    await expect(
      pool.query(
        `SELECT status, extra_workload FROM ballet_studio_followups WHERE discord_user_id = $1`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ status: 'PENDING', extra_workload: 2 }] });
    await expect(
      pool.query(
        `SELECT count(*)::integer AS count FROM ballet_studio_cycle_adjustments
         WHERE discord_user_id = $1`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  }, 30_000);

  it('eases Madame mood when fictional V3 rehabilitation is completed', async () => {
    const userId = testSnowflake();
    const studio = new BalletStudioV22Service(pool);
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [userId]);
    await pool.query(
      `INSERT INTO ballet_madame_mood_states
         (discord_user_id, mood, updated_at) VALUES ($1, 'STERN', clock_timestamp())`,
      [userId],
    );
    const classes = new BalletClassService(pool, () => 0, undefined, studio);
    const view = await classes.startOrResume(testSnowflake(), userId, 'REGULAR');
    const attemptId = randomUUID();
    await pool.query(
      `INSERT INTO ballet_class_attempts
         (attempt_id, interaction_id, class_id, discord_user_id, position, exercise_id,
          exercise_name, section, outcome, score, roll_micros, skill_snapshot,
          preparation_snapshot)
       VALUES ($1, $2, $3, $4, 0, 'studio-recovery-seed', 'Recovery seed', 'BARRE',
               'SUCCESS', 80, 500000, '{}'::jsonb, ARRAY[]::text[])`,
      [attemptId, testSnowflake(), view.classId, userId],
    );
    const setbackId = randomUUID();
    await pool.query(
      `INSERT INTO ballet_training_setbacks
         (setback_id, discord_user_id, kind, status, required_rehab_sessions,
          completed_rehab_sessions, source_attempt_id)
       VALUES ($1, $2, 'MINOR_TRAINING_STRAIN', 'ACTIVE', 2, 1, $3)`,
      [setbackId, userId, attemptId],
    );

    const training = new BalletTrainingV3Service(pool, () => 0.5, undefined, studio);
    const result = await training.recover(testSnowflake(), userId, 'REHABILITATE');
    expect(result.snapshot.setback.status).toBe('RECOVERED');
    await expect(
      pool.query(`SELECT mood FROM ballet_madame_mood_states WHERE discord_user_id = $1`, [userId]),
    ).resolves.toMatchObject({ rows: [{ mood: 'CONCERNED' }] });
    await expect(
      pool.query(
        `SELECT event_type, reason_code FROM ballet_studio_events
         WHERE discord_user_id = $1 AND event_type = 'RECOVERY_RESOLVED'`,
        [userId],
      ),
    ).resolves.toMatchObject({
      rows: [{ event_type: 'RECOVERY_RESOLVED', reason_code: 'FICTIONAL_SETBACK_RESOLVED' }],
    });
  }, 30_000);

  it('expires ignored corrective work and its bounded follow-up without stacking', async () => {
    const userId = testSnowflake();
    const studio = new BalletStudioV22Service(pool);
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [userId]);
    await pool.query(
      `INSERT INTO academy_stage_progress
         (discord_user_id, legacy_baseline_stage_id, current_stage_id)
       VALUES ($1, 'solo-seal', 'solo-seal')`,
      [userId],
    );
    const service = new BalletClassService(pool, () => 0, undefined, studio);
    let view = await service.startOrResume(testSnowflake(), userId, 'REGULAR');
    await pool.query('UPDATE ballet_stats SET stat_value = 100 WHERE discord_user_id = $1', [
      userId,
    ]);
    view = await service.begin(testSnowflake(), userId, view.classId);
    for (let index = 0; index < 2; index += 1) {
      const exercise = view.curriculum.exercises[view.currentExerciseIndex];
      if (exercise === undefined) throw new Error('Expected a class exercise.');
      view = (await service.attempt(testSnowflake(), userId, view.classId, exercise.id)).class;
    }
    await pool.query(
      `UPDATE ballet_corrective_tasks
       SET created_at = clock_timestamp() - interval '15 days',
           due_at = clock_timestamp() - interval '1 second'
       WHERE discord_user_id = $1 AND status = 'OPEN'`,
      [userId],
    );
    const training = new BalletTrainingV3Service(pool, () => 0.5, undefined, studio);
    const snapshot = await training.getSnapshot(userId);
    await new BalletStudioV22Service(pool).getWeeklyCard(userId, snapshot);
    await pool.query(
      `UPDATE ballet_studio_followups
       SET created_at = clock_timestamp() - interval '15 days',
           expires_at = clock_timestamp() - interval '1 second'
       WHERE discord_user_id = $1 AND status = 'PENDING'`,
      [userId],
    );
    const expiredCard = await new BalletStudioV22Service(pool).getWeeklyCard(userId, snapshot);
    expect(expiredCard.correctiveTasks).toHaveLength(0);
    await expect(
      pool.query(`SELECT status FROM ballet_corrective_tasks WHERE discord_user_id = $1`, [userId]),
    ).resolves.toMatchObject({ rows: [{ status: 'EXPIRED' }] });
    await expect(
      pool.query(
        `SELECT status, (count(*) OVER ())::integer AS pending_count
         FROM ballet_studio_followups WHERE discord_user_id = $1`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ status: 'EXPIRED', pending_count: 1 }] });
    await expect(
      pool.query(
        `SELECT count(*)::integer AS count FROM ballet_studio_events
         WHERE discord_user_id = $1 AND event_type IN ('CORRECTIVE_EXPIRED', 'FOLLOWUP_ASSIGNED', 'FOLLOWUP_EXPIRED')`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 3 }] });
  }, 30_000);
});
