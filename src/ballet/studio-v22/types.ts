import type { PoolClient } from 'pg';

import type {
  BalletClassSection,
  BalletExerciseOutcome,
  BalletPreparationReasonCode,
} from '../class/types.js';
import type { BalletTrainingV3Snapshot } from '../training-v3/types.js';

export const MADAME_MOODS = [
  'SUPPORTIVE',
  'ATTENTIVE',
  'CONCERNED',
  'STERN',
  'FRUSTRATED',
] as const;

export type MadameMood = (typeof MADAME_MOODS)[number];

export const STUDIO_REACTION_CODES = [
  'NORMAL_SUCCESS',
  'NORMAL_FAILURE',
  'REPEATED_FAILURE',
  'PREPARATION_WARNING',
  'CORRECTIVE_ASSIGNED',
  'CORRECTIVE_COMPLETED',
  'PATIENCE_LOW',
  'SESSION_ENDED',
  'FOLLOWUP_ASSIGNED',
] as const;

export type StudioReactionCode = (typeof STUDIO_REACTION_CODES)[number];

export interface BalletStudioAttemptResult {
  readonly reactions: readonly StudioReactionCode[];
  readonly mood: MadameMood;
  readonly patience: number;
  readonly maximumPatience: number;
  readonly sessionEndedEarly: boolean;
  readonly followup: { readonly extraWorkload: number; readonly expiresAt: Date } | null;
  readonly correctiveTask: {
    readonly taskId: string;
    readonly targetSection: BalletClassSection;
    readonly dueAt: Date;
  } | null;
}

export interface BalletStudioCorrectiveTask {
  readonly taskId: string;
  readonly taskType: 'SECTION_SUCCESS';
  readonly targetSection: BalletClassSection;
  readonly reasonCode: 'REPEATED_TRAINING_FAILURE' | 'REPEATED_PREPARATION_FAILURE';
  readonly status: 'OPEN';
  readonly createdAt: Date;
  readonly dueAt: Date;
}

export type BalletStudioReadiness = 'FAVOURABLE' | 'BALANCED' | 'RECOVERY_FOCUSED';

export interface BalletWeeklyStudioCard {
  readonly training: BalletTrainingV3Snapshot;
  readonly preparation: {
    readonly target: number | null;
    readonly completed: number | null;
    readonly remaining: number | null;
    readonly deadlineAt: Date | null;
    readonly timeRemainingMs: number | null;
  };
  readonly consistencyStamina: number;
  readonly readiness: {
    readonly state: BalletStudioReadiness;
    readonly conditionModifier: number;
  };
  readonly mood: MadameMood;
  readonly patience: { readonly current: number; readonly maximum: number } | null;
  readonly correctiveTasks: readonly BalletStudioCorrectiveTask[];
  readonly pendingFollowup: { readonly extraWorkload: number; readonly expiresAt: Date } | null;
  readonly warnings: readonly (
    | 'PREPARATION_INCOMPLETE'
    | 'CORRECTIVE_TASK_ACTIVE'
    | 'FICTIONAL_SETBACK_ACTIVE'
    | 'FOLLOWUP_PENDING'
    | 'PATIENCE_LOW'
  )[];
}

export interface BalletStudioAttemptInput {
  readonly discordUserId: string;
  readonly classId: string;
  readonly attemptId: string;
  readonly section: BalletClassSection;
  readonly outcome: BalletExerciseOutcome;
  readonly preparationStatus: 'PREPARED' | 'PARTIALLY_PREPARED' | 'UNPREPARED';
  readonly preparationReasonCode: BalletPreparationReasonCode;
  readonly finalExercise: boolean;
}

export interface BalletStudioCycleAdjustment {
  readonly followupId: string;
  readonly additionalWorkload: number;
}

export interface BalletStudioCycleAdjustmentPort {
  prepareCycleAdjustmentWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    baseTargetWorkload: number,
    now: Date,
  ): Promise<BalletStudioCycleAdjustment | null>;
  consumeCycleAdjustmentWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    cycleId: string,
    baseTargetWorkload: number,
    adjustment: BalletStudioCycleAdjustment | null,
    now: Date,
  ): Promise<void>;
  recordRecoveryResolutionWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    setbackId: string,
    now: Date,
  ): Promise<void>;
}

export interface BalletStudioV22Port extends BalletStudioCycleAdjustmentPort {
  ensureSessionWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    classId: string,
    classStatus: 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED',
  ): Promise<void>;
  closeSessionWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    classId: string,
    status: 'COMPLETED' | 'ABANDONED',
  ): Promise<void>;
  recordAttemptWithinTransaction(
    client: PoolClient,
    input: BalletStudioAttemptInput,
  ): Promise<BalletStudioAttemptResult>;
  loadAttemptResultWithinTransaction(
    client: PoolClient,
    discordUserId: string,
    classId: string,
    attemptId: string,
  ): Promise<BalletStudioAttemptResult | null>;
  getWeeklyCard(
    discordUserId: string,
    training: BalletTrainingV3Snapshot,
  ): Promise<BalletWeeklyStudioCard>;
}
