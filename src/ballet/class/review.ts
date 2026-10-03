import { sectionName } from './curriculum.js';
import type {
  BalletClassAttempt,
  BalletClassCurriculumSnapshot,
  BalletClassReview,
  BalletClassReviewCorrection,
  BalletClassSection,
  BalletSectionRating,
} from './types.js';

export function buildBalletClassReview(
  curriculum: BalletClassCurriculumSnapshot,
  attempts: readonly BalletClassAttempt[],
): BalletClassReview {
  if (attempts.length !== curriculum.exercises.length) {
    throw new RangeError('A Ballet class review requires every planned exercise attempt.');
  }

  const attemptsBySection = new Map<BalletClassSection, BalletClassAttempt[]>();
  for (const attempt of attempts) {
    const sectionAttempts = attemptsBySection.get(attempt.section) ?? [];
    sectionAttempts.push(attempt);
    attemptsBySection.set(attempt.section, sectionAttempts);
  }

  const sections = curriculum.sections.map((section) => {
    const completed = attemptsBySection.get(section.id) ?? [];
    const averageScore = Math.round(
      completed.reduce((total, attempt) => total + attempt.score, 0) /
        Math.max(1, completed.length),
    );
    return {
      section: section.id,
      displayName: section.displayName || sectionName(section.id),
      rating: sectionRating(averageScore),
      averageScore,
      completedExercises: completed.length,
    };
  });

  const corrections = new Map<string, { count: number; severity: number }>();
  for (const attempt of attempts) {
    const correction = attempt.correction;
    if (correction === null) continue;
    const current = corrections.get(correction.category) ?? { count: 0, severity: 0 };
    corrections.set(correction.category, {
      count: current.count + 1,
      severity: current.severity + correction.severity,
    });
  }
  const rankedCorrections: BalletClassReviewCorrection[] = [...corrections.entries()]
    .map(([category, value]) => ({
      category: category as BalletClassReviewCorrection['category'],
      ...value,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.severity - left.severity ||
        left.category.localeCompare(right.category),
    );

  return {
    sections,
    completedExercises: attempts.length,
    totalExercises: curriculum.exercises.length,
    primaryCorrection: rankedCorrections[0] ?? null,
    secondaryCorrection: rankedCorrections[1] ?? null,
    evidenceCodes: [...new Set(attempts.map((attempt) => attempt.exerciseId))].sort(),
  };
}

function sectionRating(score: number): BalletSectionRating {
  if (score >= 88) return 'EXCELLENT';
  if (score >= 68) return 'GOOD';
  return 'NEEDS_ATTENTION';
}
