import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BalletAcademyService } from '../../src/ballet/academy-service.js';
import { BalletAcademyGameplayService } from '../../src/ballet/academy-gameplay-service.js';
import { AcademyAssessmentService } from '../../src/ballet/assessment/assessment-service.js';
import { BalletClassService } from '../../src/ballet/class/class-service.js';
import { IdempotencyConflictError } from '../../src/economy/errors.js';
import { AcademyGameplayError } from '../../src/ballet/academy-gameplay-service.js';
import { AcademyUniformAlreadyClaimedError } from '../../src/ballet/errors.js';
import { runMigrations } from '../../src/database/migrations/runner.js';
import { createIsolatedTestPool } from '../support/test-database.js';
import { EconomyService } from '../../src/economy/economy-service.js';
import { BalletService } from '../../src/ballet/ballet-service.js';
import { BalletTrainingV3Service } from '../../src/ballet/training-v3/training-v3-service.js';
import { MarketplaceItemNotTradeableError } from '../../src/marketplace/errors.js';
import { MarketplaceService } from '../../src/marketplace/marketplace-service.js';

const integrationDescribe = process.env.NOELIA_TEST_DATABASE_URL ? describe : describe.skip;
const discordEpochMs = 1_420_070_400_000n;

function testSnowflake(): string {
  return (
    BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 15)}`) + 1_000_000_000_000_000_000n
  ).toString();
}

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

function id(): string {
  return randomUUID();
}

integrationDescribe('isolated early Academy gameplay PostgreSQL integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createIsolatedTestPool(process.env);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('enrolls atomically, equips non-tradeable hand-me-downs once, and blocks XP-only readiness', async () => {
    const userId = testSnowflake();
    const academy = new BalletAcademyService(pool);
    const gameplay = new BalletAcademyGameplayService(pool, academy);
    const enrollInteraction = testSnowflake();

    const first = await gameplay.enroll(enrollInteraction, userId);
    expect(first).toMatchObject({
      stageId: 'pre-school-dance',
      replayed: false,
      starterWear: [
        'Academy Hand-Me-Down Leotard',
        'Academy Hand-Me-Down Tights',
        'Academy Hand-Me-Down Soft Ballet Slippers',
      ],
    });
    const restarted = await new BalletAcademyGameplayService(pool, academy).enroll(
      enrollInteraction,
      userId,
    );
    expect(restarted).toMatchObject({ replayed: true, starterWear: first.starterWear });

    const inventory = await pool.query<{
      readonly item_id: string;
      readonly quantity: number;
      readonly tradeable: boolean;
    }>(
      `SELECT item_id, quantity, tradeable FROM user_inventory
       WHERE discord_user_id = $1 AND item_id LIKE 'academy-hand-me-down-%'
       ORDER BY item_id`,
      [userId],
    );
    expect(inventory.rows).toHaveLength(3);
    expect(inventory.rows.every((item) => item.quantity === 1 && !item.tradeable)).toBe(true);
    await expect(
      pool.query(
        'SELECT count(*)::integer AS count FROM wardrobe_equipment WHERE discord_user_id = $1',
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 3 }] });
    await expect(academy.claimStarterUniform(testSnowflake(), userId)).rejects.toBeInstanceOf(
      AcademyUniformAlreadyClaimedError,
    );

    const overview = await new AcademyAssessmentService(pool).getOverview(userId);
    expect(overview.targetStageId).toBe('preparatory-dance');
    expect(overview.eligibility.eligible).toBe(false);
    expect(overview.eligibility.requirements.map((requirement) => requirement.label)).toContain(
      'Complete Clap the Rhythm',
    );
  });

  it('persists beginner evidence once, enforces stage unlocks, and does not let a retry add comfort', async () => {
    const userId = testSnowflake();
    const academy = new BalletAcademyService(pool);
    const gameplay = new BalletAcademyGameplayService(pool, academy);
    await gameplay.enroll(testSnowflake(), userId);

    const actionInteraction = testSnowflake();
    const first = await gameplay.completeBeginnerAction(actionInteraction, userId, 'CLAP_RHYTHM');
    const replayed = await new BalletAcademyGameplayService(pool, academy).completeBeginnerAction(
      actionInteraction,
      userId,
      'CLAP_RHYTHM',
    );
    expect(first).toMatchObject({
      stageId: 'pre-school-dance',
      academyComfort: 2,
      replayed: false,
    });
    expect(replayed).toMatchObject({ academyComfort: 2, replayed: true });
    await expect(
      gameplay.completeBeginnerAction(testSnowflake(), userId, 'CLAP_RHYTHM'),
    ).rejects.toBeInstanceOf(AcademyGameplayError);
    await expect(
      gameplay.completeBeginnerAction(testSnowflake(), userId, 'FIRST_POSITIONS'),
    ).rejects.toBeInstanceOf(AcademyGameplayError);
    await expect(
      pool.query(
        `SELECT count(*)::integer AS actions,
                (SELECT academy_comfort FROM ballet_academy_enrollments WHERE discord_user_id = $1) AS comfort
         FROM ballet_academy_beginner_actions WHERE discord_user_id = $1`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ actions: 1, comfort: 2 }] });
  });

  it('keeps V3 skill, condition, and stamina writes locked through the two starter stages', async () => {
    const userId = testSnowflake();
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [userId]);
    await pool.query(
      `INSERT INTO user_inventory (discord_user_id, item_id, quantity, source)
       VALUES
         ($1, 'academy-hand-me-down-leotard', 1, 'EVENT_REWARD'),
         ($1, 'academy-hand-me-down-tights', 1, 'EVENT_REWARD'),
         ($1, 'academy-hand-me-down-flats', 1, 'EVENT_REWARD')`,
      [userId],
    );
    await pool.query(
      `INSERT INTO wardrobe_equipment (discord_user_id, slot, item_id)
       VALUES
         ($1, 'leotard', 'academy-hand-me-down-leotard'),
         ($1, 'tights', 'academy-hand-me-down-tights'),
         ($1, 'shoes', 'academy-hand-me-down-flats')`,
      [userId],
    );
    await new BalletService(
      pool,
      new EconomyService(pool),
      new BalletTrainingV3Service(pool),
    ).practice(testSnowflake(), userId, 'barre');

    await expect(
      pool.query(
        `SELECT
           (SELECT count(*)::integer FROM ballet_training_skills WHERE discord_user_id = $1) AS skills,
           (SELECT count(*)::integer FROM ballet_training_condition WHERE discord_user_id = $1) AS condition_rows,
           (SELECT count(*)::integer FROM ballet_training_skill_events WHERE discord_user_id = $1) AS skill_events,
           (SELECT count(*)::integer FROM ballet_stamina_workload_events WHERE discord_user_id = $1) AS workload_events`,
        [userId],
      ),
    ).resolves.toMatchObject({
      rows: [{ skills: 0, condition_rows: 0, skill_events: 0, workload_events: 0 }],
    });
  });

  it('keeps both historical and new Academy hand-me-downs out of Marketplace escrow', async () => {
    const userId = testSnowflake();
    await pool.query('INSERT INTO discord_users (discord_user_id) VALUES ($1)', [userId]);
    await pool.query(
      `INSERT INTO user_inventory (discord_user_id, item_id, quantity, source, tradeable)
       VALUES
         ($1, 'soft-pink-leotard', 1, 'EVENT_REWARD', true),
         ($1, 'cloud-soft-tights', 1, 'EVENT_REWARD', true),
         ($1, 'classic-ballet-flats', 1, 'EVENT_REWARD', true),
         ($1, 'academy-hand-me-down-leotard', 1, 'EVENT_REWARD', true)`,
      [userId],
    );
    await pool.query(
      `INSERT INTO ballet_academy_uniform_claims (
         interaction_id, discord_user_id, leotard_item_id, leotard_display_name,
         tights_item_id, tights_display_name, shoes_item_id, shoes_display_name
       ) VALUES ($1, $2, 'soft-pink-leotard', 'Soft Pink Leotard',
                 'cloud-soft-tights', 'Cloud-Soft Tights',
                 'classic-ballet-flats', 'Classic Ballet Flats')`,
      [testSnowflake(), userId],
    );
    const marketplace = new MarketplaceService(pool, new EconomyService(pool));

    await expect(
      marketplace.createListing(testSnowflake(), userId, 'soft-pink-leotard', 1, 50n),
    ).rejects.toBeInstanceOf(MarketplaceItemNotTradeableError);
    await expect(
      marketplace.createListing(testSnowflake(), userId, 'academy-hand-me-down-leotard', 1, 50n),
    ).rejects.toBeInstanceOf(MarketplaceItemNotTradeableError);
    await expect(
      pool.query(
        `SELECT quantity FROM user_inventory
         WHERE discord_user_id = $1 AND item_id IN ('soft-pink-leotard', 'academy-hand-me-down-leotard')
         ORDER BY item_id`,
        [userId],
      ),
    ).resolves.toMatchObject({ rowCount: 2 });
    await expect(
      pool.query('SELECT listing_id FROM marketplace_listings WHERE seller_user_id = $1', [userId]),
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it('schedules in an IANA timezone, supports excused cancellation, and records delayed valid check-in once', async () => {
    const userId = testSnowflake();
    const academy = new BalletAcademyService(pool);
    let serviceClock = new Date();
    const gameplay = new BalletAcademyGameplayService(pool, academy, id, () => serviceClock);
    await gameplay.enroll(testSnowflake(), userId);

    const cancelTarget = new Date(serviceClock.getTime() + 3 * 60 * 60 * 1_000);
    const bookingInteraction = testSnowflake();
    const bookingGuild = testSnowflake();
    const booking = await gameplay.scheduleClass(
      bookingInteraction,
      userId,
      bookingGuild,
      utcClassTime(cancelTarget),
    );
    await expect(
      gameplay.scheduleClass(bookingInteraction, userId, bookingGuild, utcClassTime(cancelTarget)),
    ).resolves.toMatchObject({ scheduledClassId: booking.scheduledClassId, replayed: true });
    await expect(
      gameplay.scheduleClass(
        bookingInteraction,
        userId,
        testSnowflake(),
        utcClassTime(cancelTarget),
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    const cancelId = testSnowflake();
    const cancelled = await gameplay.cancelClass(cancelId, userId, booking.scheduledClassId);
    expect(cancelled.status).toBe('CANCELLED_EXCUSED');
    await expect(
      gameplay.cancelClass(cancelId, userId, booking.scheduledClassId),
    ).resolves.toMatchObject({ status: 'CANCELLED_EXCUSED', replayed: true });

    const attendedTarget = new Date(serviceClock.getTime() + 4 * 60 * 60 * 1_000);
    const attendedBooking = await gameplay.scheduleClass(
      testSnowflake(),
      userId,
      testSnowflake(),
      utcClassTime(attendedTarget),
    );
    const checkInAt = new Date(attendedBooking.checkInOpensAt.getTime() + 5 * 60 * 1_000);
    const checkInInteraction = interactionAt(checkInAt);
    serviceClock = checkInAt;
    const checkIn = await gameplay.checkIn(
      checkInInteraction,
      userId,
      attendedBooking.scheduledClassId,
    );
    expect(checkIn.status).toBe('ATTENDED');
    await expect(
      gameplay.checkIn(checkInInteraction, userId, attendedBooking.scheduledClassId),
    ).resolves.toMatchObject({ status: 'ATTENDED', replayed: true });
    await expect(
      pool.query(
        `SELECT status, count(*)::integer AS count, min(checked_in_at) AS checked_in_at
         FROM ballet_academy_attendance WHERE scheduled_class_id = $1::uuid GROUP BY status`,
        [attendedBooking.scheduledClassId],
      ),
    ).resolves.toMatchObject({
      rows: [{ status: 'ATTENDED', count: 1, checked_in_at: checkInAt }],
    });
    const report = await gameplay.getReportBook(userId);
    expect(report.recentAttendanceStatuses).toEqual(['ATTENDED', 'CANCELLED_EXCUSED']);
  });

  it('completes a checked-in class once and derives its saved report from the existing class review', async () => {
    const userId = testSnowflake();
    const academy = new BalletAcademyService(pool);
    const target = new Date(Date.now() - 60 * 60 * 1_000);
    const roundedTarget = new Date(target);
    roundedTarget.setUTCSeconds(0, 0);
    let serviceClock = new Date(roundedTarget.getTime() - 60 * 60 * 1_000);
    const gameplay = new BalletAcademyGameplayService(pool, academy, id, () => serviceClock);
    await gameplay.enroll(testSnowflake(), userId);
    const booking = await gameplay.scheduleClass(
      testSnowflake(),
      userId,
      testSnowflake(),
      utcClassTime(roundedTarget),
    );
    const balletClass = new BalletClassService(pool, () => 0.99);
    let view = await balletClass.startOrResume(testSnowflake(), userId, 'REGULAR');
    expect(view.curriculum.academyStageId).toBe('pre-school-dance');
    serviceClock = new Date(booking.checkInOpensAt.getTime() + 1_000);
    await gameplay.checkIn(interactionAt(serviceClock), userId, booking.scheduledClassId);
    view = await balletClass.startOrResume(testSnowflake(), userId, 'REGULAR');
    await expect(
      pool.query(
        'SELECT class_id::text FROM ballet_academy_scheduled_classes WHERE scheduled_class_id = $1::uuid',
        [booking.scheduledClassId],
      ),
    ).resolves.toMatchObject({ rows: [{ class_id: view.classId }] });
    view = await balletClass.begin(testSnowflake(), userId, view.classId);
    let lastAttemptInteractionId = '';
    let lastExerciseId = '';
    for (const exercise of view.curriculum.exercises) {
      lastAttemptInteractionId = testSnowflake();
      lastExerciseId = exercise.id;
      const result = await balletClass.attempt(
        lastAttemptInteractionId,
        userId,
        view.classId,
        exercise.id,
      );
      view = result.class;
    }
    expect(view.status).toBe('COMPLETED');
    await expect(
      balletClass.attempt(lastAttemptInteractionId, userId, view.classId, lastExerciseId),
    ).resolves.toMatchObject({ replayed: true });
    await expect(
      pool.query(
        `SELECT report.overall_grade, report.participation_grade,
                report.academy_comfort_gain,
                report.evidence_snapshot ->> 'calculationVersion' AS calculation_version,
                enrollment.academy_comfort
         FROM ballet_academy_scheduled_classes AS scheduled
         JOIN ballet_academy_attendance AS attendance USING (scheduled_class_id)
         JOIN ballet_academy_report_cards AS report USING (attendance_id)
         JOIN ballet_academy_enrollments AS enrollment
           ON enrollment.discord_user_id = scheduled.discord_user_id
         WHERE scheduled.scheduled_class_id = $1::uuid AND scheduled.class_id = $2::uuid`,
        [booking.scheduledClassId, view.classId],
      ),
    ).resolves.toMatchObject({
      rowCount: 1,
      rows: [
        {
          overall_grade: expect.any(Number),
          participation_grade: 1,
          academy_comfort_gain: 5,
          calculation_version: '1',
          academy_comfort: 5,
        },
      ],
    });
  });

  it('marks a missed class once only after continuously observed service uptime and cancels uncertain windows safely', async () => {
    const userId = testSnowflake();
    const academy = new BalletAcademyService(pool);
    const scheduledTarget = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    scheduledTarget.setUTCSeconds(0, 0);
    let serviceClock = new Date(scheduledTarget.getTime() - 60 * 60 * 1_000);
    const gameplay = new BalletAcademyGameplayService(pool, academy, id, () => serviceClock);
    await gameplay.enroll(testSnowflake(), userId);
    const missed = await gameplay.scheduleClass(
      testSnowflake(),
      userId,
      testSnowflake(),
      utcClassTime(scheduledTarget),
    );

    const runtimeId = id();
    const continuityStartedAt = new Date(missed.checkInOpensAt.getTime() - 60 * 1_000);
    await pool.query(
      `INSERT INTO ballet_academy_scheduler_state (
         singleton, runtime_instance_id, last_heartbeat_at, continuity_started_at
       ) VALUES (true, $1::uuid, clock_timestamp() - interval '5 seconds', $2)
       ON CONFLICT (singleton) DO UPDATE SET
         runtime_instance_id = EXCLUDED.runtime_instance_id,
         last_heartbeat_at = EXCLUDED.last_heartbeat_at,
         continuity_started_at = EXCLUDED.continuity_started_at`,
      [runtimeId, continuityStartedAt],
    );
    expect(await gameplay.reconcileDueClasses(runtimeId)).toBe(1);
    expect(await gameplay.reconcileDueClasses(runtimeId)).toBe(0);
    await expect(
      pool.query(
        `SELECT attendance.status, report.rhythm_grade, report.technique_grade,
                report.coordination_grade, report.participation_grade, report.overall_grade
         FROM ballet_academy_attendance AS attendance
         JOIN ballet_academy_report_cards AS report USING (attendance_id)
         WHERE attendance.scheduled_class_id = $1::uuid`,
        [missed.scheduledClassId],
      ),
    ).resolves.toMatchObject({
      rowCount: 1,
      rows: [
        {
          status: 'MISSED_UNEXCUSED',
          rhythm_grade: null,
          technique_grade: null,
          coordination_grade: null,
          participation_grade: 6,
          overall_grade: 6,
        },
      ],
    });

    const systemTarget = new Date(scheduledTarget.getTime() - 60 * 60 * 1_000);
    serviceClock = new Date(systemTarget.getTime() - 60 * 60 * 1_000);
    const uncertain = await gameplay.scheduleClass(
      testSnowflake(),
      userId,
      testSnowflake(),
      utcClassTime(systemTarget),
    );
    const restartedRuntime = id();
    expect(await gameplay.reconcileDueClasses(restartedRuntime)).toBe(1);
    await expect(
      pool.query(
        'SELECT status FROM ballet_academy_attendance WHERE scheduled_class_id = $1::uuid',
        [uncertain.scheduledClassId],
      ),
    ).resolves.toMatchObject({ rows: [{ status: 'SYSTEM_CANCELLED' }] });
  });
});
