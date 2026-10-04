import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { GAMEPLAY_CONFIG } from '../config/gameplay.js';
import { withTransaction } from '../database/transaction.js';
import { IdempotencyConflictError } from '../economy/errors.js';
import { assertDiscordSnowflake, discordSnowflakeCreatedAt } from '../utils/discord-snowflake.js';
import { ExpectedDomainError } from '../utils/expected-domain-error.js';
import { AcademyUniformAlreadyClaimedError } from './errors.js';
import { canonicalAcademyStageId, getAcademyStageDefinition } from './academy.js';
import {
  ensureAcademyStageBaseline,
  ensureAndLockAcademyUser,
  loadBalletAcademyProgress,
} from './academy-service.js';
import {
  ACADEMY_BEGINNER_ACTIONS,
  calculateAcademyReportGrades,
  getAvailableBeginnerActions,
  missedAcademyReport,
} from './academy-gameplay.js';
import type { AcademyBeginnerActionCode, AcademyReportGrades } from './academy-gameplay.js';
import {
  AcademyLocalTimeError,
  resolveAcademyClassTime,
  validateAcademyScheduleHorizon,
} from './academy-time.js';
import type { LocalAcademyClassTime } from './academy-time.js';
import type { BalletAcademyPort } from './academy-service.js';
import type { BalletClassReview, BalletClassType } from './class/types.js';

type TransactionalAcademyUniformPort = BalletAcademyPort &
  Required<Pick<BalletAcademyPort, 'claimStarterUniformInTransaction'>>;

export interface AcademySchedulePolicy {
  readonly minimumLeadMs: number;
  readonly maximumLeadMs: number;
  readonly checkInBeforeMs: number;
  readonly checkInAfterMs: number;
  readonly delayedDeliveryGraceMs: number;
  readonly cancellationCutoffMs: number;
  readonly schedulerHeartbeatToleranceMs: number;
  readonly maxDuePerTick: number;
}

export const ACADEMY_SCHEDULE_POLICY: AcademySchedulePolicy = GAMEPLAY_CONFIG.academySchedule;

export class AcademyGameplayError extends ExpectedDomainError {
  public constructor(message: string, userMessage = message) {
    super(message, userMessage);
    this.name = 'AcademyGameplayError';
  }
}

export interface AcademyEnrollmentResult {
  readonly stageId: string;
  readonly stageName: string;
  readonly enrolledAt: Date;
  readonly starterWear: readonly string[];
  readonly replayed: boolean;
}

export interface AcademyBeginnerActionResult {
  readonly actionCode: AcademyBeginnerActionCode;
  readonly actionName: string;
  readonly stageId: string;
  readonly academyComfort: number;
  readonly completedActions: readonly AcademyBeginnerActionCode[];
  readonly replayed: boolean;
}

export type AcademyScheduledClassStatus =
  'SCHEDULED' | 'ATTENDED' | 'CANCELLED_EXCUSED' | 'MISSED_UNEXCUSED' | 'SYSTEM_CANCELLED';

export interface AcademyScheduledClass {
  readonly scheduledClassId: string;
  readonly stageId: string;
  readonly stageName: string;
  readonly classType: BalletClassType;
  readonly timeZone: string;
  readonly scheduledAt: Date;
  readonly checkInOpensAt: Date;
  readonly checkInClosesAt: Date;
  readonly cancellationDeadlineAt: Date;
  readonly status: AcademyScheduledClassStatus;
  readonly replayed: boolean;
}

export interface AcademyReportEntry {
  readonly scheduledClassId: string;
  readonly stageName: string;
  readonly timeZone: string;
  readonly scheduledAt: Date;
  readonly status: AcademyScheduledClassStatus;
  readonly grades: AcademyReportGrades | null;
}

export interface AcademyReportBook {
  readonly enrolled: boolean;
  readonly enrolledAt: Date | null;
  readonly stageId: string;
  readonly stageName: string;
  readonly academyComfort: number;
  readonly completedActions: readonly AcademyBeginnerActionCode[];
  readonly attendedCount: number;
  readonly excusedCount: number;
  readonly missedCount: number;
  readonly systemCancelledCount: number;
  readonly recentAttendanceStatuses: readonly AcademyScheduledClassStatus[];
  readonly entries: readonly AcademyReportEntry[];
}

export interface AcademyGameplayPort {
  enroll(interactionId: string, discordUserId: string): Promise<AcademyEnrollmentResult>;
  completeBeginnerAction(
    interactionId: string,
    discordUserId: string,
    actionCode: AcademyBeginnerActionCode,
  ): Promise<AcademyBeginnerActionResult>;
  scheduleClass(
    interactionId: string,
    discordUserId: string,
    guildId: string,
    localTime: LocalAcademyClassTime,
  ): Promise<AcademyScheduledClass>;
  cancelClass(
    interactionId: string,
    discordUserId: string,
    scheduledClassId: string,
  ): Promise<AcademyScheduledClass>;
  checkIn(
    interactionId: string,
    discordUserId: string,
    scheduledClassId: string,
  ): Promise<AcademyScheduledClass>;
  getReportBook(discordUserId: string): Promise<AcademyReportBook>;
  reconcileDueClasses(runtimeInstanceId: string): Promise<number>;
}

interface EnrollmentRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly enrollment_interaction_id: string;
  readonly enrolled_at: Date;
  readonly academy_comfort: number;
}

interface ScheduleRow extends QueryResultRow {
  readonly scheduled_class_id: string;
  readonly discord_user_id: string;
  readonly class_type: string;
  readonly academy_stage_id: string;
  readonly academy_stage_name: string;
  readonly time_zone: string;
  readonly scheduled_at: Date;
  readonly check_in_opens_at: Date;
  readonly check_in_closes_at: Date;
  readonly cancellation_deadline_at: Date;
  readonly status: string;
  readonly request_fingerprint: string;
}

interface ScheduleActionRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly scheduled_class_id: string;
  readonly action_type: 'CANCEL' | 'CHECK_IN';
  readonly request_fingerprint: string;
}

interface EnrollmentActionRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly enrollment_interaction_id: string;
  readonly enrolled_at: Date;
  readonly academy_comfort: number;
  readonly current_stage_id: string | null;
  readonly current_stage_name: string | null;
}

interface BeginnerReplayRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly action_code: string;
  readonly academy_stage_id: string;
  readonly familiarity_gain: number;
}

interface ReportRow extends QueryResultRow {
  readonly scheduled_class_id: string;
  readonly academy_stage_name: string;
  readonly time_zone: string;
  readonly scheduled_at: Date;
  readonly status: string;
  readonly rhythm_grade: number | null;
  readonly technique_grade: number | null;
  readonly coordination_grade: number | null;
  readonly preparation_grade: number | null;
  readonly participation_grade: number | null;
  readonly overall_grade: number | null;
}

interface RuntimeStateRow extends QueryResultRow {
  readonly runtime_instance_id: string;
  readonly last_heartbeat_at: Date;
  readonly continuity_started_at: Date;
}

interface DueScheduleRow extends QueryResultRow {
  readonly scheduled_class_id: string;
  readonly discord_user_id: string;
  readonly academy_stage_id: string;
  readonly check_in_opens_at: Date;
}

export class BalletAcademyGameplayService {
  public constructor(
    private readonly pool: Pool,
    private readonly uniform: TransactionalAcademyUniformPort,
    private readonly createId: () => string = randomUUID,
    private readonly now: () => Date = () => new Date(),
    private readonly schedulePolicy: AcademySchedulePolicy = ACADEMY_SCHEDULE_POLICY,
  ) {
    assertSchedulePolicy(schedulePolicy);
  }

  public async enroll(
    interactionId: string,
    discordUserId: string,
  ): Promise<AcademyEnrollmentResult> {
    assertIds(interactionId, discordUserId);
    return withTransaction(this.pool, async (client) => {
      const existingByInteraction = await client.query<EnrollmentActionRow>(
        `SELECT enrollment.discord_user_id, enrollment.enrollment_interaction_id,
                enrollment.enrolled_at, enrollment.academy_comfort,
                stage.current_stage_id
         FROM ballet_academy_enrollments AS enrollment
         LEFT JOIN academy_stage_progress AS stage
           ON stage.discord_user_id = enrollment.discord_user_id
         WHERE enrollment.enrollment_interaction_id = $1`,
        [interactionId],
      );
      const replay = existingByInteraction.rows[0];
      let enrollment: Omit<AcademyEnrollmentResult, 'starterWear'>;
      if (replay !== undefined) {
        if (replay.discord_user_id !== discordUserId) throw new IdempotencyConflictError();
        const stageId = canonicalAcademyStageId(replay.current_stage_id ?? 'pre-school-dance');
        enrollment = {
          stageId,
          stageName: getAcademyStageDefinition(stageId)?.title ?? stageId,
          enrolledAt: replay.enrolled_at,
          replayed: true,
        };
      } else {
        await ensureAndLockAcademyUser(client, discordUserId);
        const stageId = await ensureAcademyStageBaseline(client, discordUserId);
        const stage = await loadBalletAcademyProgress(client, discordUserId);
        const existing = await client.query<EnrollmentRow>(
          `SELECT discord_user_id, enrollment_interaction_id, enrolled_at, academy_comfort
           FROM ballet_academy_enrollments WHERE discord_user_id = $1 FOR UPDATE`,
          [discordUserId],
        );
        const current = existing.rows[0];
        if (current !== undefined) {
          enrollment = {
            stageId,
            stageName: stage.currentRank.title,
            enrolledAt: current.enrolled_at,
            replayed: true,
          };
        } else {
          const inserted = await client.query<{ readonly enrolled_at: Date }>(
            `INSERT INTO ballet_academy_enrollments (discord_user_id, enrollment_interaction_id)
             VALUES ($1, $2) RETURNING enrolled_at`,
            [discordUserId, interactionId],
          );
          const enrolledAt = inserted.rows[0]?.enrolled_at;
          if (enrolledAt === undefined) throw new Error('Academy enrollment was not recorded.');
          enrollment = { stageId, stageName: stage.currentRank.title, enrolledAt, replayed: false };
        }
      }

      let starterWear: readonly string[] = [];
      if (enrollment.stageId === 'pre-school-dance') {
        try {
          const claim = await this.uniform.claimStarterUniformInTransaction(
            client,
            interactionId,
            discordUserId,
          );
          starterWear = claim.items;
        } catch (error) {
          if (!(error instanceof AcademyUniformAlreadyClaimedError)) throw error;
        }
      }
      return { ...enrollment, starterWear };
    });
  }

  public async completeBeginnerAction(
    interactionId: string,
    discordUserId: string,
    actionCode: AcademyBeginnerActionCode,
  ): Promise<AcademyBeginnerActionResult> {
    assertIds(interactionId, discordUserId);
    const definition = ACADEMY_BEGINNER_ACTIONS.find((action) => action.code === actionCode);
    if (definition === undefined) throw new AcademyGameplayError('Unknown beginner action.');
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockAcademyUser(client, discordUserId);
      const replay = await client.query<BeginnerReplayRow>(
        `SELECT discord_user_id, action_code, academy_stage_id, familiarity_gain
         FROM ballet_academy_beginner_actions WHERE interaction_id = $1`,
        [interactionId],
      );
      const replayRow = replay.rows[0];
      if (replayRow !== undefined) {
        if (replayRow.discord_user_id !== discordUserId || replayRow.action_code !== actionCode) {
          throw new IdempotencyConflictError();
        }
        const current = await this.loadBeginnerState(client, discordUserId);
        return {
          actionCode,
          actionName: definition.name,
          stageId: canonicalAcademyStageId(replayRow.academy_stage_id),
          academyComfort: current.academyComfort,
          completedActions: current.completedActions,
          replayed: true,
        };
      }

      const enrollment = await client.query(
        'SELECT 1 FROM ballet_academy_enrollments WHERE discord_user_id = $1',
        [discordUserId],
      );
      if (enrollment.rows[0] === undefined) {
        throw new AcademyGameplayError(
          'Academy enrollment is required.',
          'Enroll first with /academy enroll.',
        );
      }
      await ensureAcademyStageBaseline(client, discordUserId);
      const progress = await loadBalletAcademyProgress(client, discordUserId);
      const available = getAvailableBeginnerActions(progress.currentRank.id);
      if (!available.some((action) => action.code === actionCode)) {
        throw new AcademyGameplayError(
          `The ${definition.name} foundation is not available at this Academy stage.`,
          `That foundation unlocks at ${definition.minimumStageId === 'pre-school-dance' ? 'Pre-School Dance' : 'Preparatory Dance'}.`,
        );
      }
      const usedToday = await client.query(
        `SELECT 1 FROM ballet_academy_beginner_actions
         WHERE discord_user_id = $1 AND action_code = $2
           AND action_day = (clock_timestamp() AT TIME ZONE 'UTC')::date`,
        [discordUserId, actionCode],
      );
      if (usedToday.rows[0] !== undefined) {
        throw new AcademyGameplayError(
          'This beginner action was already completed today.',
          'You have already practiced this foundation today. Choose another beginner action and return tomorrow.',
        );
      }
      await client.query(
        `INSERT INTO ballet_academy_beginner_actions (
           interaction_id, discord_user_id, academy_stage_id, action_code, familiarity_gain
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          interactionId,
          discordUserId,
          progress.currentRank.id,
          actionCode,
          definition.familiarityGain,
        ],
      );
      await client.query(
        `UPDATE ballet_academy_enrollments
         SET academy_comfort = LEAST(100, academy_comfort + $2)
         WHERE discord_user_id = $1`,
        [discordUserId, definition.familiarityGain],
      );
      const state = await this.loadBeginnerState(client, discordUserId);
      return {
        actionCode,
        actionName: definition.name,
        stageId: progress.currentRank.id,
        academyComfort: state.academyComfort,
        completedActions: state.completedActions,
        replayed: false,
      };
    });
  }

  public async scheduleClass(
    interactionId: string,
    discordUserId: string,
    guildId: string,
    localTime: LocalAcademyClassTime,
  ): Promise<AcademyScheduledClass> {
    assertIds(interactionId, discordUserId);
    assertDiscordSnowflake(guildId, 'Discord guild ID');
    const now = this.now();
    let scheduledAt: Date;
    try {
      scheduledAt = resolveAcademyClassTime(localTime);
      validateAcademyScheduleHorizon(
        scheduledAt,
        now,
        this.schedulePolicy.minimumLeadMs,
        this.schedulePolicy.maximumLeadMs,
      );
    } catch (error) {
      if (error instanceof AcademyLocalTimeError) {
        throw new AcademyGameplayError(error.message, error.message);
      }
      throw error;
    }
    const opensAt = new Date(scheduledAt.getTime() - this.schedulePolicy.checkInBeforeMs);
    const closesAt = new Date(scheduledAt.getTime() + this.schedulePolicy.checkInAfterMs);
    const cancellationDeadline = new Date(
      scheduledAt.getTime() - this.schedulePolicy.cancellationCutoffMs,
    );
    const requestFingerprint = fingerprint(
      'SCHEDULE',
      discordUserId,
      guildId,
      localTime.date,
      localTime.time,
      localTime.timeZone,
      scheduledAt.toISOString(),
    );

    return withTransaction(this.pool, async (client) => {
      await ensureAndLockAcademyUser(client, discordUserId);
      const replay = await client.query<ScheduleRow>(
        `SELECT scheduled_class_id::text, discord_user_id, class_type, academy_stage_id,
                academy_stage_name, time_zone, scheduled_at, check_in_opens_at,
                check_in_closes_at, cancellation_deadline_at, status, request_fingerprint
         FROM ballet_academy_scheduled_classes WHERE interaction_id = $1`,
        [interactionId],
      );
      const existing = replay.rows[0];
      if (existing !== undefined) {
        if (
          existing.discord_user_id !== discordUserId ||
          existing.request_fingerprint !== requestFingerprint
        ) {
          throw new IdempotencyConflictError();
        }
        return toScheduledClass(existing, true);
      }
      const enrolled = await client.query(
        'SELECT 1 FROM ballet_academy_enrollments WHERE discord_user_id = $1',
        [discordUserId],
      );
      if (enrolled.rows[0] === undefined) {
        throw new AcademyGameplayError(
          'Academy enrollment is required.',
          'Enroll first with /academy enroll before scheduling a class.',
        );
      }
      const existingSlot = await client.query(
        `SELECT 1 FROM ballet_academy_scheduled_classes
         WHERE discord_user_id = $1 AND scheduled_at = $2 AND status = 'SCHEDULED'`,
        [discordUserId, scheduledAt],
      );
      if (existingSlot.rows[0] !== undefined) {
        throw new AcademyGameplayError(
          'A class is already scheduled for this time.',
          'You already have an Academy class booked for that time.',
        );
      }
      await ensureAcademyStageBaseline(client, discordUserId);
      const progress = await loadBalletAcademyProgress(client, discordUserId);
      const scheduledClassId = this.createId();
      const inserted = await client.query<ScheduleRow>(
        `INSERT INTO ballet_academy_scheduled_classes (
           scheduled_class_id, interaction_id, discord_user_id, guild_id, class_type,
           academy_stage_id, academy_stage_name, time_zone, scheduled_at,
           check_in_opens_at, check_in_closes_at, cancellation_deadline_at,
           request_fingerprint
         ) VALUES ($1::uuid, $2, $3, $4, 'REGULAR', $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING scheduled_class_id::text, discord_user_id, class_type, academy_stage_id,
                   academy_stage_name, time_zone, scheduled_at, check_in_opens_at,
                   check_in_closes_at, cancellation_deadline_at, status, request_fingerprint`,
        [
          scheduledClassId,
          interactionId,
          discordUserId,
          guildId,
          progress.currentRank.id,
          progress.currentRank.title,
          localTime.timeZone,
          scheduledAt,
          opensAt,
          closesAt,
          cancellationDeadline,
          requestFingerprint,
        ],
      );
      const row = inserted.rows[0];
      if (row === undefined) throw new Error('The scheduled Academy class was not saved.');
      return toScheduledClass(row, false);
    });
  }

  public async cancelClass(
    interactionId: string,
    discordUserId: string,
    scheduledClassId: string,
  ): Promise<AcademyScheduledClass> {
    assertIds(interactionId, discordUserId);
    assertUuid(scheduledClassId);
    const requestFingerprint = fingerprint('CANCEL', discordUserId, scheduledClassId);
    return this.updateScheduledClass(
      interactionId,
      discordUserId,
      scheduledClassId,
      'CANCEL',
      requestFingerprint,
      async (client, row) => {
        if (row.status !== 'SCHEDULED') {
          throw new AcademyGameplayError(
            'Only a scheduled class can be cancelled.',
            'This class is no longer scheduled.',
          );
        }
        if (this.now().getTime() > row.cancellation_deadline_at.getTime()) {
          throw new AcademyGameplayError(
            'The Academy cancellation window has closed.',
            'Classes must be cancelled at least one hour before their start time.',
          );
        }
        await client.query(
          `UPDATE ballet_academy_scheduled_classes SET status = 'CANCELLED_EXCUSED'
         WHERE scheduled_class_id = $1::uuid AND status = 'SCHEDULED'`,
          [scheduledClassId],
        );
        await insertAttendance(
          client,
          this.createId(),
          scheduledClassId,
          discordUserId,
          'CANCELLED_EXCUSED',
          null,
        );
        return { ...row, status: 'CANCELLED_EXCUSED' };
      },
    );
  }

  public async checkIn(
    interactionId: string,
    discordUserId: string,
    scheduledClassId: string,
  ): Promise<AcademyScheduledClass> {
    assertIds(interactionId, discordUserId);
    assertUuid(scheduledClassId);
    const requestFingerprint = fingerprint('CHECK_IN', discordUserId, scheduledClassId);
    return this.updateScheduledClass(
      interactionId,
      discordUserId,
      scheduledClassId,
      'CHECK_IN',
      requestFingerprint,
      async (client, row) => {
        if (row.status !== 'SCHEDULED') {
          throw new AcademyGameplayError(
            'This scheduled class cannot be checked in.',
            'This class is no longer open for check-in.',
          );
        }
        const now = this.now();
        const interactionAt = discordSnowflakeCreatedAt(interactionId);
        const deliveryDeadline = new Date(
          row.check_in_closes_at.getTime() + this.schedulePolicy.delayedDeliveryGraceMs,
        );
        if (
          interactionAt < row.check_in_opens_at ||
          interactionAt > row.check_in_closes_at ||
          now > deliveryDeadline
        ) {
          throw new AcademyGameplayError(
            'The check-in window is closed.',
            'That check-in window is closed. Check your Academy report for the saved class time.',
          );
        }
        await client.query(
          `UPDATE ballet_academy_scheduled_classes SET status = 'ATTENDED'
         WHERE scheduled_class_id = $1::uuid AND status = 'SCHEDULED'`,
          [scheduledClassId],
        );
        await insertAttendance(
          client,
          this.createId(),
          scheduledClassId,
          discordUserId,
          'ATTENDED',
          interactionAt,
        );
        return { ...row, status: 'ATTENDED' };
      },
    );
  }

  public async getReportBook(discordUserId: string): Promise<AcademyReportBook> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    return withTransaction(this.pool, async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const progress = await loadBalletAcademyProgress(client, discordUserId);
      const enrollmentResult = await client.query<{
        readonly enrolled_at: Date;
        readonly academy_comfort: number;
      }>(
        `SELECT enrolled_at, academy_comfort FROM ballet_academy_enrollments
         WHERE discord_user_id = $1`,
        [discordUserId],
      );
      const enrollment = enrollmentResult.rows[0];
      const [actionsResult, attendanceResult, entriesResult, recentAttendanceResult] =
        await Promise.all([
          client.query<{ readonly action_code: string }>(
            `SELECT DISTINCT action_code FROM ballet_academy_beginner_actions
           WHERE discord_user_id = $1 ORDER BY action_code`,
            [discordUserId],
          ),
          client.query<{ readonly status: string; readonly count: number }>(
            `SELECT status, count(*)::integer AS count FROM ballet_academy_attendance
           WHERE discord_user_id = $1 GROUP BY status`,
            [discordUserId],
          ),
          client.query<ReportRow>(
            `SELECT scheduled.scheduled_class_id::text, scheduled.academy_stage_name,
                  scheduled.time_zone, scheduled.scheduled_at, scheduled.status,
                  report.rhythm_grade, report.technique_grade, report.coordination_grade,
                  report.preparation_grade, report.participation_grade, report.overall_grade
           FROM ballet_academy_scheduled_classes AS scheduled
           LEFT JOIN ballet_academy_attendance AS attendance
             ON attendance.scheduled_class_id = scheduled.scheduled_class_id
           LEFT JOIN ballet_academy_report_cards AS report
             ON report.attendance_id = attendance.attendance_id
           WHERE scheduled.discord_user_id = $1
           ORDER BY scheduled.scheduled_at DESC LIMIT 10`,
            [discordUserId],
          ),
          client.query<{ readonly status: string }>(
            `SELECT attendance.status
           FROM ballet_academy_attendance AS attendance
           INNER JOIN ballet_academy_scheduled_classes AS scheduled
             ON scheduled.scheduled_class_id = attendance.scheduled_class_id
           WHERE attendance.discord_user_id = $1
           ORDER BY scheduled.scheduled_at DESC, attendance.recorded_at DESC
           LIMIT 10`,
            [discordUserId],
          ),
        ]);
      const counts = new Map(attendanceResult.rows.map((row) => [row.status, row.count]));
      const actions = actionsResult.rows.map((row) => parseBeginnerAction(row.action_code));
      const entries = entriesResult.rows.map((row) => ({
        scheduledClassId: row.scheduled_class_id,
        stageName: row.academy_stage_name,
        timeZone: row.time_zone,
        scheduledAt: row.scheduled_at,
        status: parseScheduledClassStatus(row.status),
        grades:
          row.overall_grade === null
            ? null
            : {
                rhythm: row.rhythm_grade,
                technique: row.technique_grade,
                coordination: row.coordination_grade,
                preparation: row.preparation_grade,
                participation: row.participation_grade!,
                overall: row.overall_grade,
              },
      }));
      return {
        enrolled: enrollment !== undefined,
        enrolledAt: enrollment?.enrolled_at ?? null,
        stageId: progress.currentRank.id,
        stageName: progress.currentRank.title,
        academyComfort: enrollment?.academy_comfort ?? 0,
        completedActions: actions,
        attendedCount: counts.get('ATTENDED') ?? 0,
        excusedCount: counts.get('CANCELLED_EXCUSED') ?? 0,
        missedCount: counts.get('MISSED_UNEXCUSED') ?? 0,
        systemCancelledCount: counts.get('SYSTEM_CANCELLED') ?? 0,
        recentAttendanceStatuses: recentAttendanceResult.rows.map((row) =>
          parseScheduledClassStatus(row.status),
        ),
        entries,
      };
    });
  }

  /** One shared scheduler heartbeat; missed status requires a continuously observed check-in window. */
  public async reconcileDueClasses(runtimeInstanceId: string): Promise<number> {
    assertUuid(runtimeInstanceId);
    return withTransaction(this.pool, async (client) => {
      const timeResult = await client.query<{ readonly observed_at: Date }>(
        'SELECT clock_timestamp() AS observed_at',
      );
      const observedAt = timeResult.rows[0]?.observed_at;
      if (observedAt === undefined) throw new Error('Academy scheduler clock is unavailable.');
      const stateResult = await client.query<RuntimeStateRow>(
        `SELECT runtime_instance_id::text, last_heartbeat_at, continuity_started_at
         FROM ballet_academy_scheduler_state WHERE singleton = true FOR UPDATE`,
      );
      const state = stateResult.rows[0];
      const interrupted =
        state === undefined ||
        state.runtime_instance_id !== runtimeInstanceId ||
        observedAt.getTime() - state.last_heartbeat_at.getTime() >
          this.schedulePolicy.schedulerHeartbeatToleranceMs;
      const continuityStartedAt = interrupted ? observedAt : state.continuity_started_at;
      await client.query(
        `INSERT INTO ballet_academy_scheduler_state (
           singleton, runtime_instance_id, last_heartbeat_at, continuity_started_at
         ) VALUES (true, $1::uuid, $2, $3)
         ON CONFLICT (singleton) DO UPDATE SET
           runtime_instance_id = EXCLUDED.runtime_instance_id,
           last_heartbeat_at = EXCLUDED.last_heartbeat_at,
           continuity_started_at = EXCLUDED.continuity_started_at`,
        [runtimeInstanceId, observedAt, continuityStartedAt],
      );

      const settledThrough = new Date(
        observedAt.getTime() - this.schedulePolicy.delayedDeliveryGraceMs,
      );
      const due = await client.query<DueScheduleRow>(
        `SELECT scheduled_class_id::text, discord_user_id, academy_stage_id, check_in_opens_at
         FROM ballet_academy_scheduled_classes
         WHERE status = 'SCHEDULED' AND check_in_closes_at <= $1
         ORDER BY check_in_closes_at, scheduled_class_id
         LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [settledThrough, this.schedulePolicy.maxDuePerTick],
      );
      for (const session of due.rows) {
        const status =
          continuityStartedAt.getTime() <= session.check_in_opens_at.getTime()
            ? 'MISSED_UNEXCUSED'
            : 'SYSTEM_CANCELLED';
        const updated = await client.query(
          `UPDATE ballet_academy_scheduled_classes SET status = $2
           WHERE scheduled_class_id = $1::uuid AND status = 'SCHEDULED'`,
          [session.scheduled_class_id, status],
        );
        if (updated.rowCount !== 1) continue;
        const attendanceId = this.createId();
        await insertAttendance(
          client,
          attendanceId,
          session.scheduled_class_id,
          session.discord_user_id,
          status,
          null,
        );
        if (status === 'MISSED_UNEXCUSED') {
          await insertMissedReport(
            client,
            attendanceId,
            session.discord_user_id,
            canonicalAcademyStageId(session.academy_stage_id),
          );
        }
      }
      return due.rows.length;
    });
  }

  private async loadBeginnerState(
    client: PoolClient,
    discordUserId: string,
  ): Promise<{
    readonly academyComfort: number;
    readonly completedActions: readonly AcademyBeginnerActionCode[];
  }> {
    const result = await client.query<{
      readonly academy_comfort: number;
      readonly action_codes: string[];
    }>(
      `SELECT COALESCE(enrollment.academy_comfort, 0) AS academy_comfort,
              COALESCE(array_agg(DISTINCT action.action_code)
                FILTER (WHERE action.action_code IS NOT NULL), ARRAY[]::text[]) AS action_codes
       FROM (SELECT $1::text AS discord_user_id) AS user_row
       LEFT JOIN ballet_academy_enrollments AS enrollment
         ON enrollment.discord_user_id = user_row.discord_user_id
       LEFT JOIN ballet_academy_beginner_actions AS action
         ON action.discord_user_id = user_row.discord_user_id
       GROUP BY enrollment.academy_comfort`,
      [discordUserId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('Academy beginner progress could not be loaded.');
    return {
      academyComfort: row.academy_comfort,
      completedActions: row.action_codes.map(parseBeginnerAction),
    };
  }

  private async updateScheduledClass(
    interactionId: string,
    discordUserId: string,
    scheduledClassId: string,
    actionType: 'CANCEL' | 'CHECK_IN',
    requestFingerprint: string,
    apply: (client: PoolClient, row: ScheduleRow) => Promise<ScheduleRow>,
  ): Promise<AcademyScheduledClass> {
    return withTransaction(this.pool, async (client) => {
      await ensureAndLockAcademyUser(client, discordUserId);
      const existingAction = await client.query<ScheduleActionRow>(
        `SELECT discord_user_id, scheduled_class_id::text, action_type, request_fingerprint
         FROM ballet_academy_schedule_actions WHERE interaction_id = $1`,
        [interactionId],
      );
      const replay = existingAction.rows[0];
      if (replay !== undefined) {
        if (
          replay.discord_user_id !== discordUserId ||
          replay.scheduled_class_id !== scheduledClassId ||
          replay.action_type !== actionType ||
          replay.request_fingerprint !== requestFingerprint
        )
          throw new IdempotencyConflictError();
        const saved = await this.loadSchedule(client, scheduledClassId, discordUserId);
        return toScheduledClass(saved, true);
      }
      const row = await this.loadSchedule(client, scheduledClassId, discordUserId, true);
      const updated = await apply(client, row);
      await client.query(
        `INSERT INTO ballet_academy_schedule_actions (
           interaction_id, discord_user_id, scheduled_class_id, action_type, request_fingerprint
         ) VALUES ($1, $2, $3::uuid, $4, $5)`,
        [interactionId, discordUserId, scheduledClassId, actionType, requestFingerprint],
      );
      return toScheduledClass(updated, false);
    });
  }

  private async loadSchedule(
    client: PoolClient,
    scheduledClassId: string,
    discordUserId: string,
    forUpdate = false,
  ): Promise<ScheduleRow> {
    const result = await client.query<ScheduleRow>(
      `SELECT scheduled_class_id::text, discord_user_id, class_type, academy_stage_id,
              academy_stage_name, time_zone, scheduled_at, check_in_opens_at,
              check_in_closes_at, cancellation_deadline_at, status, request_fingerprint
       FROM ballet_academy_scheduled_classes
       WHERE scheduled_class_id = $1::uuid AND discord_user_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
      [scheduledClassId, discordUserId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new AcademyGameplayError(
        'Scheduled Academy class not found.',
        'That scheduled class could not be found.',
      );
    }
    return row;
  }
}

export async function loadEarlyAcademyEvidence(
  client: Pick<PoolClient, 'query'>,
  discordUserId: string,
  targetStageId: 'preparatory-dance' | 'pre-primary',
): Promise<{
  readonly enrolled: boolean;
  readonly academyComfort: number;
  readonly completedActions: readonly AcademyBeginnerActionCode[];
  readonly attendedScheduledClasses: number;
  readonly acceptableReportCards: number;
  readonly missedScheduledClasses: number;
}> {
  const sourceStageId =
    targetStageId === 'preparatory-dance' ? 'pre-school-dance' : 'preparatory-dance';
  const result = await client.query<{
    readonly enrolled: boolean;
    readonly academy_comfort: number;
    readonly action_codes: string[];
    readonly attended_count: number;
    readonly acceptable_report_count: number;
    readonly missed_count: number;
  }>(
    `SELECT EXISTS (
              SELECT 1 FROM ballet_academy_enrollments WHERE discord_user_id = $1
            ) AS enrolled,
            COALESCE((SELECT academy_comfort FROM ballet_academy_enrollments WHERE discord_user_id = $1), 0) AS academy_comfort,
            COALESCE((SELECT array_agg(DISTINCT action_code)
                      FROM ballet_academy_beginner_actions WHERE discord_user_id = $1), ARRAY[]::text[]) AS action_codes,
            (SELECT count(*)::integer
             FROM ballet_academy_attendance AS attendance
             INNER JOIN ballet_academy_scheduled_classes AS scheduled
               ON scheduled.scheduled_class_id = attendance.scheduled_class_id
             WHERE attendance.discord_user_id = $1 AND attendance.status = 'ATTENDED'
               AND scheduled.academy_stage_id = ANY($2::text[])) AS attended_count,
            (SELECT count(*)::integer
             FROM ballet_academy_report_cards AS report
             INNER JOIN ballet_academy_attendance AS attendance USING (attendance_id)
             INNER JOIN ballet_academy_scheduled_classes AS scheduled
               ON scheduled.scheduled_class_id = attendance.scheduled_class_id
             WHERE report.discord_user_id = $1 AND report.overall_grade <= 4
               AND scheduled.academy_stage_id = ANY($2::text[])) AS acceptable_report_count,
            (SELECT count(*)::integer
             FROM ballet_academy_attendance AS attendance
             INNER JOIN ballet_academy_scheduled_classes AS scheduled
               ON scheduled.scheduled_class_id = attendance.scheduled_class_id
             WHERE attendance.discord_user_id = $1 AND attendance.status = 'MISSED_UNEXCUSED'
               AND scheduled.academy_stage_id = ANY($2::text[])) AS missed_count`,
    [discordUserId, storageStageIds(sourceStageId)],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Early Academy eligibility evidence is unavailable.');
  return {
    enrolled: row.enrolled,
    academyComfort: row.academy_comfort,
    completedActions: row.action_codes.map(parseBeginnerAction),
    attendedScheduledClasses: row.attended_count,
    acceptableReportCards: row.acceptable_report_count,
    missedScheduledClasses: row.missed_count,
  };
}

export async function attachScheduledClassToBalletClass(
  client: PoolClient,
  discordUserId: string,
  classId: string,
  classType: BalletClassType,
  academyStageId: string,
): Promise<void> {
  const candidate = await client.query<{ readonly scheduled_class_id: string }>(
    `SELECT scheduled_class_id::text
     FROM ballet_academy_scheduled_classes
     WHERE discord_user_id = $1 AND status = 'ATTENDED' AND class_id IS NULL
       AND class_type = $2 AND academy_stage_id = ANY($3::text[])
       AND scheduled_at BETWEEN clock_timestamp() - interval '3 hours'
                             AND clock_timestamp() + interval '15 minutes'
     ORDER BY scheduled_at DESC, scheduled_class_id
     LIMIT 1 FOR UPDATE`,
    [discordUserId, classType, storageStageIds(academyStageId)],
  );
  const scheduledClassId = candidate.rows[0]?.scheduled_class_id;
  if (scheduledClassId === undefined) return;
  await client.query(
    `UPDATE ballet_academy_scheduled_classes SET class_id = $2::uuid
     WHERE scheduled_class_id = $1::uuid AND class_id IS NULL`,
    [scheduledClassId, classId],
  );
}

export async function recordAcademyClassReport(
  client: PoolClient,
  discordUserId: string,
  classId: string,
  stageId: string,
  review: BalletClassReview,
  preparationCount: number,
): Promise<void> {
  const attendance = await client.query<{ readonly attendance_id: string }>(
    `SELECT attendance.attendance_id::text
     FROM ballet_academy_scheduled_classes AS scheduled
     INNER JOIN ballet_academy_attendance AS attendance
       ON attendance.scheduled_class_id = scheduled.scheduled_class_id
     WHERE scheduled.class_id = $1::uuid AND scheduled.discord_user_id = $2
       AND attendance.status = 'ATTENDED'`,
    [classId, discordUserId],
  );
  const attendanceId = attendance.rows[0]?.attendance_id;
  if (attendanceId === undefined) return;
  const grades = calculateAcademyReportGrades(stageId, review, preparationCount);
  const saved = await client.query(
    `INSERT INTO ballet_academy_report_cards (
       attendance_id, discord_user_id, academy_stage_id, rhythm_grade,
       technique_grade, coordination_grade, preparation_grade,
       academy_comfort_gain, participation_grade, overall_grade,
       source_class_id, evidence_snapshot
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 5, $8, $9, $10::uuid, $11::jsonb)
     ON CONFLICT (attendance_id) DO NOTHING
     RETURNING attendance_id::text`,
    [
      attendanceId,
      discordUserId,
      canonicalAcademyStageId(stageId),
      grades.rhythm,
      grades.technique,
      grades.coordination,
      grades.preparation,
      grades.participation,
      grades.overall,
      classId,
      JSON.stringify({ review, preparationCount, academyComfortGain: 5, calculationVersion: 1 }),
    ],
  );
  if (saved.rowCount === 1) {
    const updated = await client.query(
      `UPDATE ballet_academy_enrollments
       SET academy_comfort = LEAST(100, academy_comfort + 5)
       WHERE discord_user_id = $1`,
      [discordUserId],
    );
    if (updated.rowCount !== 1) {
      throw new Error('Academy comfort could not be updated for the completed class.');
    }
  }
}

async function insertMissedReport(
  client: PoolClient,
  attendanceId: string,
  discordUserId: string,
  stageId: string,
): Promise<void> {
  const grades = missedAcademyReport();
  await client.query(
    `INSERT INTO ballet_academy_report_cards (
       attendance_id, discord_user_id, academy_stage_id, rhythm_grade,
       technique_grade, coordination_grade, preparation_grade,
       academy_comfort_gain, participation_grade, overall_grade, evidence_snapshot
     ) VALUES ($1::uuid, $2, $3, NULL, NULL, NULL, NULL, 0, 6, 6, $4::jsonb)
     ON CONFLICT (attendance_id) DO NOTHING`,
    [attendanceId, discordUserId, stageId, JSON.stringify({ reason: 'MISSED_UNEXCUSED', grades })],
  );
}

async function insertAttendance(
  client: PoolClient,
  attendanceId: string,
  scheduledClassId: string,
  discordUserId: string,
  status: 'ATTENDED' | 'CANCELLED_EXCUSED' | 'MISSED_UNEXCUSED' | 'SYSTEM_CANCELLED',
  checkedInAt: Date | null,
): Promise<void> {
  await client.query(
    `INSERT INTO ballet_academy_attendance (
       attendance_id, scheduled_class_id, discord_user_id, status, checked_in_at
     ) VALUES ($1::uuid, $2::uuid, $3, $4, $5)
     ON CONFLICT (scheduled_class_id) DO NOTHING`,
    [attendanceId, scheduledClassId, discordUserId, status, checkedInAt],
  );
}

function toScheduledClass(row: ScheduleRow, replayed: boolean): AcademyScheduledClass {
  return {
    scheduledClassId: row.scheduled_class_id,
    stageId: canonicalAcademyStageId(row.academy_stage_id),
    stageName: row.academy_stage_name,
    classType: parseClassType(row.class_type),
    timeZone: row.time_zone,
    scheduledAt: row.scheduled_at,
    checkInOpensAt: row.check_in_opens_at,
    checkInClosesAt: row.check_in_closes_at,
    cancellationDeadlineAt: row.cancellation_deadline_at,
    status: parseScheduledClassStatus(row.status),
    replayed,
  };
}

function parseScheduledClassStatus(value: string): AcademyScheduledClassStatus {
  if (
    value === 'SCHEDULED' ||
    value === 'ATTENDED' ||
    value === 'CANCELLED_EXCUSED' ||
    value === 'MISSED_UNEXCUSED' ||
    value === 'SYSTEM_CANCELLED'
  )
    return value;
  throw new Error('Database returned an invalid Academy class status.');
}

function parseClassType(value: string): BalletClassType {
  if (
    value === 'REGULAR' ||
    value === 'TECHNIQUE' ||
    value === 'BARRE_FOCUS' ||
    value === 'CENTRE_FOCUS' ||
    value === 'TURNS' ||
    value === 'ALLEGRO' ||
    value === 'CONDITIONING' ||
    value === 'REPERTOIRE' ||
    value === 'ASSESSMENT_PREPARATION'
  )
    return value;
  throw new Error('Database returned an invalid Academy class type.');
}

function parseBeginnerAction(value: string): AcademyBeginnerActionCode {
  const action = ACADEMY_BEGINNER_ACTIONS.find((candidate) => candidate.code === value);
  if (action === undefined) throw new Error('Database returned an invalid Academy action.');
  return action.code;
}

function storageStageIds(stageId: string): readonly string[] {
  const canonical = canonicalAcademyStageId(stageId);
  return canonical === 'pre-school-dance' ? [canonical, 'minis-bambinis'] : [canonical];
}

function fingerprint(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function assertIds(interactionId: string, discordUserId: string): void {
  assertDiscordSnowflake(interactionId, 'Discord interaction ID');
  assertDiscordSnowflake(discordUserId, 'Discord user ID');
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError('Academy class ID must be a UUID.');
  }
}

function assertSchedulePolicy(policy: AcademySchedulePolicy): void {
  const requiredPositive = [
    policy.minimumLeadMs,
    policy.checkInBeforeMs,
    policy.checkInAfterMs,
    policy.schedulerHeartbeatToleranceMs,
    policy.maxDuePerTick,
  ];
  const requiredNonNegative = [policy.delayedDeliveryGraceMs, policy.cancellationCutoffMs];
  if (
    requiredPositive.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    requiredNonNegative.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    !Number.isSafeInteger(policy.maximumLeadMs) ||
    policy.maximumLeadMs <= policy.minimumLeadMs
  ) {
    throw new RangeError('Academy schedule policy values must be safe integer durations/counts.');
  }
}
