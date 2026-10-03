import * as Eris from 'eris';

import type { AcademyAssessmentOverview, AcademyAssessmentAttemptView } from './types.js';

export type AcademyAssessmentComponentAction =
  | { readonly action: 'start' }
  | {
      readonly action: 'answer';
      readonly attemptId: string;
      readonly questionId: string;
      readonly answerId: string;
    };

export function parseAcademyAssessmentComponentId(
  customId: string,
): AcademyAssessmentComponentAction | null {
  const parts = customId.split(':');
  if (parts[0] !== 'noelia' || parts[1] !== 'academy-assessment') return null;
  if (parts[2] === 'start' && parts.length === 3) return { action: 'start' };
  const [, , action, attemptId, questionId, answerId] = parts;
  if (
    action === 'answer' &&
    parts.length === 6 &&
    attemptId !== undefined &&
    isUuid(attemptId) &&
    questionId !== undefined &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(questionId) &&
    answerId !== undefined &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(answerId)
  ) {
    return { action, attemptId, questionId, answerId };
  }
  return null;
}

export function isAcademyAssessmentComponentId(customId: string): boolean {
  return customId.startsWith('noelia:academy-assessment:');
}

export function createAcademyAssessmentComponents(
  overview: AcademyAssessmentOverview,
): Eris.ActionRow[] {
  if (overview.activeAttempt !== null) return attemptComponents(overview.activeAttempt);
  if (!overview.eligibility.eligible || overview.targetStageId === null) return [];
  return [
    {
      type: Eris.Constants.ComponentTypes.ACTION_ROW,
      components: [
        {
          type: Eris.Constants.ComponentTypes.BUTTON,
          style: Eris.Constants.ButtonStyles.PRIMARY,
          custom_id: 'noelia:academy-assessment:start',
          label: `Start ${overview.targetStageName ?? 'Academy'} assessment`,
        },
      ],
    },
  ];
}

export function createAcademyAssessmentAttemptComponents(
  attempt: AcademyAssessmentAttemptView,
): Eris.ActionRow[] {
  return attemptComponents(attempt);
}

function attemptComponents(attempt: AcademyAssessmentAttemptView): Eris.ActionRow[] {
  const question = attempt.currentQuestion;
  if (attempt.status !== 'IN_PROGRESS' || question === null) return [];
  return question.answers.map((answer) => ({
    type: Eris.Constants.ComponentTypes.ACTION_ROW,
    components: [
      {
        type: Eris.Constants.ComponentTypes.BUTTON,
        style: Eris.Constants.ButtonStyles.SECONDARY,
        custom_id:
          `noelia:academy-assessment:answer:${attempt.attemptId}:` + `${question.id}:${answer.id}`,
        label: answer.label.slice(0, 80),
      },
    ],
  }));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
