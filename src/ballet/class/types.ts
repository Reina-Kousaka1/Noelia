import type { BalletStatKey } from '../types.js';

export const BALLET_CLASS_TYPES = [
  'REGULAR',
  'TECHNIQUE',
  'BARRE_FOCUS',
  'CENTRE_FOCUS',
  'TURNS',
  'ALLEGRO',
  'CONDITIONING',
  'REPERTOIRE',
  'ASSESSMENT_PREPARATION',
] as const;

export type BalletClassType = (typeof BALLET_CLASS_TYPES)[number];
export type BalletClassStatus = 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';

export const BALLET_CLASS_SECTIONS = [
  'BARRE',
  'CENTRE',
  'ADAGIO',
  'TURNS',
  'ALLEGRO',
  'TECHNIQUE',
  'CONDITIONING',
  'REPERTOIRE',
] as const;

export type BalletClassSection = (typeof BALLET_CLASS_SECTIONS)[number];

export const BALLET_PREPARATION_AREAS = [
  'GENERAL_WARM_UP',
  'MOBILITY',
  'CORE_ACTIVATION',
  'BALANCE',
  'BARRE',
  'TURNS',
  'JUMPS',
] as const;

export type BalletPreparationArea = (typeof BALLET_PREPARATION_AREAS)[number];

export const BALLET_CORRECTION_CATEGORIES = [
  'BALANCE',
  'TIMING',
  'FOOTWORK',
  'TECHNIQUE',
  'COORDINATION',
  'POSTURE_PLACEMENT',
  'TURN_CONTROL',
  'JUMP_CONTROL',
  'MUSICALITY',
] as const;

export type BalletCorrectionCategory = (typeof BALLET_CORRECTION_CATEGORIES)[number];
export type BalletExerciseOutcome = 'PERFECT' | 'SUCCESS' | 'SHAKY' | 'FAIL';
export type BalletSectionRating = 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION';

export interface BalletExerciseDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly family: string;
  readonly section: BalletClassSection;
  readonly description: string;
  readonly difficulty: number;
  readonly minimumStageIndex: number;
  readonly skillWeights: Readonly<Partial<Record<BalletStatKey, number>>>;
  readonly preparationRequirements: readonly BalletPreparationArea[];
  readonly correctionCategories: readonly BalletCorrectionCategory[];
  readonly evidenceCode: string;
}

export interface BalletClassSectionSnapshot {
  readonly id: BalletClassSection;
  readonly displayName: string;
  readonly exercises: readonly BalletExerciseDefinition[];
}

export interface BalletClassCurriculumSnapshot {
  readonly version: 1;
  readonly classType: BalletClassType;
  readonly classTypeName: string;
  readonly academyStageId: string;
  readonly academyStageName: string;
  readonly sections: readonly BalletClassSectionSnapshot[];
  readonly exercises: readonly BalletExerciseDefinition[];
}

export interface BalletClassAttempt {
  readonly attemptId: string;
  readonly interactionId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly section: BalletClassSection;
  readonly outcome: BalletExerciseOutcome;
  readonly score: number;
  readonly rollMicros: number;
  readonly correction: {
    readonly category: BalletCorrectionCategory;
    readonly severity: number;
  } | null;
  readonly skillSnapshot: Readonly<Record<BalletStatKey, number>>;
  readonly preparationSnapshot: readonly BalletPreparationArea[];
  readonly attemptedAt: Date;
  readonly trainingEffects?: {
    readonly skills: Readonly<Record<string, number>>;
    readonly condition: Readonly<{
      energy: number;
      nutrition: number;
      fatigue: number;
      sleepDebt: number;
    }>;
    readonly performanceModifier: number;
    readonly setbackTriggered: boolean;
  } | null;
}

export interface BalletClassReviewSection {
  readonly section: BalletClassSection;
  readonly displayName: string;
  readonly rating: BalletSectionRating;
  readonly averageScore: number;
  readonly completedExercises: number;
}

export interface BalletClassReviewCorrection {
  readonly category: BalletCorrectionCategory;
  readonly count: number;
  readonly severity: number;
}

export interface BalletClassReview {
  readonly sections: readonly BalletClassReviewSection[];
  readonly completedExercises: number;
  readonly totalExercises: number;
  readonly primaryCorrection: BalletClassReviewCorrection | null;
  readonly secondaryCorrection: BalletClassReviewCorrection | null;
  readonly evidenceCodes: readonly string[];
}

export interface BalletClassView {
  readonly classId: string;
  readonly discordUserId: string;
  readonly classType: BalletClassType;
  readonly classTypeName: string;
  readonly academyStageId: string;
  readonly academyStageName: string;
  readonly status: BalletClassStatus;
  readonly currentSection: BalletClassSection | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly abandonedAt: Date | null;
  readonly currentExerciseIndex: number;
  readonly curriculum: BalletClassCurriculumSnapshot;
  readonly preparation: readonly BalletPreparationArea[];
  readonly attempts: readonly BalletClassAttempt[];
  readonly review: BalletClassReview | null;
  readonly replayed: boolean;
}

export interface BalletClassAttemptResult {
  readonly class: BalletClassView;
  readonly attempt: BalletClassAttempt | null;
  readonly replayed: boolean;
}

export interface BalletClassPort {
  startOrResume(
    interactionId: string,
    discordUserId: string,
    classType: BalletClassType,
  ): Promise<BalletClassView>;
  getClass(discordUserId: string, classId: string): Promise<BalletClassView>;
  markPreparation(
    interactionId: string,
    discordUserId: string,
    classId: string,
    area: BalletPreparationArea,
  ): Promise<BalletClassView>;
  begin(interactionId: string, discordUserId: string, classId: string): Promise<BalletClassView>;
  attempt(
    interactionId: string,
    discordUserId: string,
    classId: string,
    expectedExerciseId: string,
  ): Promise<BalletClassAttemptResult>;
  abandon(interactionId: string, discordUserId: string, classId: string): Promise<BalletClassView>;
}
