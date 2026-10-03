import type { BalletClassReview } from '../class/types.js';
import type { AcademyAssessmentResult } from './types.js';

export function evaluateAcademyAssessmentResult(
  review: BalletClassReview,
  correctAnswers: number,
  totalQuestions: number,
  completedAt: Date,
): AcademyAssessmentResult {
  if (
    !Number.isSafeInteger(correctAnswers) ||
    !Number.isSafeInteger(totalQuestions) ||
    totalQuestions < 1 ||
    correctAnswers < 0 ||
    correctAnswers > totalQuestions
  ) {
    throw new RangeError('Assessment Knowledge result is invalid.');
  }
  if (review.completedExercises !== review.totalExercises || review.totalExercises < 1) {
    throw new RangeError('Assessment Practical evidence must be a completed Ballet class review.');
  }

  const needsRetake =
    correctAnswers === 0 || review.sections.some((section) => section.rating === 'NEEDS_ATTENTION');
  const perfect =
    correctAnswers === totalQuestions &&
    review.sections.every((section) => section.rating === 'EXCELLENT') &&
    review.primaryCorrection === null;
  const status = needsRetake ? 'RETAKE_REQUIRED' : perfect ? 'PASS' : 'PASS_WITH_CORRECTIONS';

  return {
    status,
    correctAnswers,
    totalQuestions,
    practicalSections: review.sections,
    primaryCorrection: review.primaryCorrection,
    secondaryCorrection: review.secondaryCorrection,
    completedAt,
    promoted: status !== 'RETAKE_REQUIRED',
  };
}
