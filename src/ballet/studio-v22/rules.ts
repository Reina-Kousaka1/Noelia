import type { BalletExerciseOutcome, BalletPreparationStatus } from '../class/types.js';
import { MADAME_MOODS } from './types.js';
import type { MadameMood } from './types.js';

export const MADAME_STUDIO_RULES = {
  maximumPatience: 3,
  patienceLostPerFailure: 1,
  patienceRegainedPerSuccess: 1,
  correctiveAfterConsecutiveFailures: 2,
  earlyEndAfterConsecutiveFailures: 4,
  correctiveTaskValidityDays: 14,
  followupValidityDays: 14,
  followupAdditionalWorkload: 2,
  maximumBaseTargetForFollowup: 40,
  moodEaseIntervalHours: 48,
  preparationConcernAfterGaps: 3,
} as const;

export function nextPatience(current: number, outcome: BalletExerciseOutcome): number {
  if (!Number.isInteger(current) || current < 0 || current > MADAME_STUDIO_RULES.maximumPatience) {
    throw new RangeError('Madame patience must be between zero and its configured maximum.');
  }
  if (outcome === 'FAIL') {
    return Math.max(0, current - MADAME_STUDIO_RULES.patienceLostPerFailure);
  }
  if (outcome === 'SUCCESS' || outcome === 'PERFECT') {
    return Math.min(
      MADAME_STUDIO_RULES.maximumPatience,
      current + MADAME_STUDIO_RULES.patienceRegainedPerSuccess,
    );
  }
  return current;
}

export function moodAfterAttempt(
  current: MadameMood,
  outcome: BalletExerciseOutcome,
  consecutiveFailures: number,
  preparationGapStreak: number,
  preparationStatus: BalletPreparationStatus,
): MadameMood {
  let mood = current;
  if (outcome === 'FAIL') {
    const failureMood =
      consecutiveFailures >= 4
        ? 'FRUSTRATED'
        : consecutiveFailures === 3
          ? 'STERN'
          : consecutiveFailures === 2
            ? 'CONCERNED'
            : 'ATTENTIVE';
    mood = moreSevereMood(mood, failureMood);
  } else if (outcome === 'PERFECT' || outcome === 'SUCCESS') {
    mood = easeMood(mood, 1);
  }

  if (preparationStatus !== 'PREPARED') {
    const preparationMood =
      preparationGapStreak >= MADAME_STUDIO_RULES.preparationConcernAfterGaps
        ? 'CONCERNED'
        : 'ATTENTIVE';
    mood = moreSevereMood(mood, preparationMood);
  }
  return mood;
}

export function moodAfterIgnoredCorrectiveTask(current: MadameMood): MadameMood {
  return moreSevereMood(current, 'STERN');
}

export function easeMood(current: MadameMood, steps: number): MadameMood {
  if (!Number.isInteger(steps) || steps < 0) throw new RangeError('Mood easing steps are invalid.');
  const index = MADAME_MOODS.indexOf(current);
  if (index < 0) throw new RangeError('Madame mood is invalid.');
  return MADAME_MOODS[Math.max(0, index - steps)] ?? 'SUPPORTIVE';
}

export function moreSevereMood(current: MadameMood, candidate: MadameMood): MadameMood {
  const currentIndex = MADAME_MOODS.indexOf(current);
  const candidateIndex = MADAME_MOODS.indexOf(candidate);
  if (currentIndex < 0 || candidateIndex < 0) throw new RangeError('Madame mood is invalid.');
  return MADAME_MOODS[Math.max(currentIndex, candidateIndex)] ?? 'SUPPORTIVE';
}

export function moodDecay(
  current: MadameMood,
  updatedAt: Date,
  now: Date,
): { readonly mood: MadameMood; readonly updatedAt: Date; readonly steps: number } {
  if (Number.isNaN(updatedAt.getTime()) || Number.isNaN(now.getTime())) {
    throw new RangeError('Madame mood timestamps must be valid.');
  }
  const intervalMs = MADAME_STUDIO_RULES.moodEaseIntervalHours * 3_600_000;
  const steps = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / intervalMs));
  return {
    mood: easeMood(current, steps),
    updatedAt: new Date(updatedAt.getTime() + steps * intervalMs),
    steps,
  };
}
