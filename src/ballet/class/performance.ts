import type { BalletStats } from '../types.js';
import type {
  BalletClassAttempt,
  BalletCorrectionCategory,
  BalletExerciseDefinition,
  BalletExerciseOutcome,
  BalletPreparationArea,
} from './types.js';

/**
 * Initial gameplay calibration, in score points rather than claimed real-world
 * probabilities. These defaults are centralized and intentionally provisional.
 */
export const BALLET_CLASS_CALIBRATION = {
  version: 1,
  baseScore: 66,
  skillContribution: 0.28,
  difficultyPenalty: 4,
  preparationAdjustment: 4,
  rollSwing: 8,
  perfectMinimum: 92,
  successMinimum: 72,
  shakyMinimum: 45,
} as const;

export interface BalletExerciseEvaluation {
  readonly score: number;
  readonly outcome: BalletExerciseOutcome;
  readonly correction: {
    readonly category: BalletCorrectionCategory;
    readonly severity: number;
  } | null;
  readonly rollMicros: number;
}

export function evaluateBalletExercise(
  exercise: BalletExerciseDefinition,
  stats: BalletStats,
  preparation: ReadonlySet<BalletPreparationArea>,
  randomValue: number,
): BalletExerciseEvaluation {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError('Exercise RNG must return a finite value in [0, 1).');
  }
  if (
    !Number.isInteger(exercise.difficulty) ||
    exercise.difficulty < 1 ||
    exercise.difficulty > 5
  ) {
    throw new RangeError('Exercise difficulty must be an integer from 1 to 5.');
  }

  let weightedSkillTotal = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(exercise.skillWeights)) {
    const value = stats[key as keyof BalletStats];
    if (
      value === undefined ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 100 ||
      !Number.isInteger(weight) ||
      weight === undefined ||
      weight <= 0
    ) {
      throw new RangeError('Exercise skill weights must reference valid Ballet stats.');
    }
    weightedSkillTotal += value * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0)
    throw new RangeError('An exercise needs at least one existing Ballet stat.');

  const weightedSkill = weightedSkillTotal / totalWeight;
  const preparationCount = exercise.preparationRequirements.filter((area) =>
    preparation.has(area),
  ).length;
  const preparationRatio =
    exercise.preparationRequirements.length === 0
      ? 0.5
      : preparationCount / exercise.preparationRequirements.length;
  const preparationOffset =
    (preparationRatio - 0.5) * 2 * BALLET_CLASS_CALIBRATION.preparationAdjustment;
  const rollOffset = (randomValue - 0.5) * 2 * BALLET_CLASS_CALIBRATION.rollSwing;
  const rawScore =
    BALLET_CLASS_CALIBRATION.baseScore +
    weightedSkill * BALLET_CLASS_CALIBRATION.skillContribution -
    (exercise.difficulty - 1) * BALLET_CLASS_CALIBRATION.difficultyPenalty +
    preparationOffset +
    rollOffset;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const outcome = getExerciseOutcome(score);
  const correction =
    outcome === 'SHAKY' || outcome === 'FAIL'
      ? {
          category: chooseCorrection(exercise, randomValue),
          severity: outcome === 'FAIL' ? 3 : 2,
        }
      : null;

  return { score, outcome, correction, rollMicros: Math.floor(randomValue * 1_000_000) };
}

export function getExerciseOutcome(score: number): BalletExerciseOutcome {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new RangeError('Exercise score must be an integer from 0 to 100.');
  }
  if (score >= BALLET_CLASS_CALIBRATION.perfectMinimum) return 'PERFECT';
  if (score >= BALLET_CLASS_CALIBRATION.successMinimum) return 'SUCCESS';
  if (score >= BALLET_CLASS_CALIBRATION.shakyMinimum) return 'SHAKY';
  return 'FAIL';
}

export function correctionForEvaluation(
  exercise: BalletExerciseDefinition,
  randomValue: number,
  outcome: BalletExerciseOutcome,
): BalletClassAttempt['correction'] {
  if (outcome !== 'SHAKY' && outcome !== 'FAIL') return null;
  return {
    category: chooseCorrection(exercise, randomValue),
    severity: outcome === 'FAIL' ? 3 : 2,
  };
}

function chooseCorrection(
  exercise: BalletExerciseDefinition,
  randomValue: number,
): BalletCorrectionCategory {
  const categories = exercise.correctionCategories;
  if (categories.length === 0)
    throw new RangeError('Exercises with corrections need a correction category.');
  return categories[Math.floor(randomValue * categories.length)]!;
}
