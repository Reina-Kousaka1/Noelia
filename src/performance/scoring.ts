import type { PerformanceStatRequirement, PerformanceTier } from './types.js';

export function calculatePerformanceScore(
  requirements: readonly PerformanceStatRequirement[],
  stats: Readonly<Record<string, number>>,
): number {
  if (requirements.length === 0) {
    throw new RangeError('A Ballet performance requires at least one scoring stat.');
  }

  let weightedScore = 0;
  let totalWeight = 0;
  for (const requirement of requirements) {
    const value = stats[requirement.key];
    if (
      value === undefined ||
      !Number.isInteger(value) ||
      value < requirement.minimum ||
      value > 100 ||
      !Number.isInteger(requirement.weight) ||
      requirement.weight <= 0
    ) {
      throw new RangeError('Performance stats do not satisfy the scoring requirements.');
    }
    weightedScore += value * requirement.weight;
    totalWeight += requirement.weight;
  }

  return Math.max(0, Math.min(100, Math.round(weightedScore / totalWeight)));
}

export function getPerformanceTier(score: number): PerformanceTier {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new RangeError('Performance score must be an integer between 0 and 100.');
  }
  if (score >= 90) return 'PRIMA';
  if (score >= 75) return 'GOLD';
  if (score >= 55) return 'SILVER';
  return 'BRONZE';
}
