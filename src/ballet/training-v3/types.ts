export const BALLET_TRAINING_SKILLS = [
  'balance',
  'core_control',
  'footwork',
  'coordination',
  'turn_control',
  'jump_control',
  'placement',
  'musicality',
] as const;

export type BalletTrainingSkill = (typeof BALLET_TRAINING_SKILLS)[number];
export type BalletTrainingSkillValues = Readonly<Record<BalletTrainingSkill, number>>;

export const BALLET_RECOVERY_ACTIONS = ['REST', 'SLEEP', 'NOURISH', 'REHABILITATE'] as const;
export type BalletRecoveryAction = (typeof BALLET_RECOVERY_ACTIONS)[number];

export type BalletSetbackStatus = 'NONE' | 'ACTIVE' | 'RECOVERED';
export type BalletStaminaCycleStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
export type BalletTrainingSetbackKind = 'MINOR_TRAINING_STRAIN';

export interface BalletConditionSnapshot {
  readonly energy: number;
  readonly nutrition: number;
  readonly fatigue: number;
  readonly sleepDebt: number;
  readonly updatedAt: Date;
}

export interface BalletStaminaCycleSnapshot {
  readonly cycleNumber: number;
  readonly targetWorkload: number;
  readonly completedWorkload: number;
  readonly status: BalletStaminaCycleStatus;
  readonly startedAt: Date;
  readonly deadlineAt: Date;
  readonly completedAt: Date | null;
  readonly belowFloorException: boolean;
}

export interface BalletTrainingSetbackSnapshot {
  readonly status: BalletSetbackStatus;
  readonly kind: BalletTrainingSetbackKind | null;
  readonly requiredRehabSessions: number;
  readonly completedRehabSessions: number;
  readonly startedAt: Date | null;
  readonly recoveredAt: Date | null;
}

export interface BalletTrainingV3Snapshot {
  readonly skills: BalletTrainingSkillValues;
  readonly condition: BalletConditionSnapshot;
  readonly staminaCycle: BalletStaminaCycleSnapshot | null;
  readonly setback: BalletTrainingSetbackSnapshot;
  readonly shoeFit: {
    readonly sizeEu: number;
    readonly fit: 'STANDARD' | 'NARROW' | 'WIDE';
    readonly updatedAt: Date;
  } | null;
}

export interface BalletRecoveryResult {
  readonly action: BalletRecoveryAction;
  readonly snapshot: BalletTrainingV3Snapshot;
  readonly replayed: boolean;
}

export interface BalletTrainingMutationResult {
  readonly snapshot: BalletTrainingV3Snapshot;
  readonly setbackTriggered: boolean;
}

export interface BalletShoeFitProfile {
  readonly sizeEu: number;
  readonly fit: 'STANDARD' | 'NARROW' | 'WIDE';
  readonly updatedAt: Date;
}

export interface BalletTrainingV3Port {
  getSnapshot(discordUserId: string): Promise<BalletTrainingV3Snapshot>;
  recover(
    interactionId: string,
    discordUserId: string,
    action: BalletRecoveryAction,
  ): Promise<BalletRecoveryResult>;
  setShoeFitProfile(
    interactionId: string,
    discordUserId: string,
    sizeEu: number,
    fit: 'STANDARD' | 'NARROW' | 'WIDE',
  ): Promise<{ readonly profile: BalletShoeFitProfile; readonly replayed: boolean }>;
}
