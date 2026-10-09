import * as Eris from 'eris';

import type { BalletClassAttempt, BalletClassView } from '../../ballet/class/types.js';
import { createBalletClassComponents } from '../../ballet/class/components.js';
import type { PersonaTextPort } from '../../persona/generator.js';
import { renderPersonaEmbed } from '../../persona/presentation.js';
import { sectionName } from '../../ballet/class/curriculum.js';

export async function renderBalletClassMessage(
  view: BalletClassView,
  presenter: PersonaTextPort | undefined,
  discordUserId: string,
  latestAttempt?: BalletClassAttempt,
): Promise<Eris.InteractionContentEdit> {
  const isReview = view.status === 'COMPLETED';
  const isPreparing = view.status === 'PREPARING';
  const isAbandoned = view.status === 'ABANDONED';
  const attemptCount = view.attempts.length;
  const description = isReview
    ? renderReview(view)
    : isAbandoned
      ? 'This session was left before completion. Its recorded attempts remain in the class history, and no completion evidence was granted.'
      : isPreparing
        ? renderPreparation(view)
        : renderInProgress(view, latestAttempt);
  const action = isReview
    ? 'class_review'
    : isAbandoned
      ? 'class_abandoned'
      : isPreparing
        ? 'class_preparing'
        : latestAttempt === undefined
          ? 'class_in_progress'
          : 'class_result';
  const facts = {
    academy_stage: view.academyStageId,
    class_index: attemptCount,
    exercise_count: view.curriculum.exercises.length,
    preparation_count: view.preparation.length,
    ...(latestAttempt === undefined ? {} : { exercise_score: latestAttempt.score }),
  };

  return {
    embeds: [
      await renderPersonaEmbed(
        presenter,
        'ballet',
        action,
        facts,
        {
          title: 'Maison Noélia · ' + view.classTypeName,
          description,
          fields: [
            {
              name: 'Academy stage',
              value: view.academyStageName,
              inline: true,
            },
            {
              name: 'Session',
              value: view.status === 'COMPLETED' ? 'Class review' : view.status.replace('_', ' '),
              inline: true,
            },
            {
              name: 'Progress',
              value: attemptCount + ' / ' + view.curriculum.exercises.length + ' exercises',
              inline: true,
            },
          ],
        },
        discordUserId,
      ),
    ],
    components: createBalletClassComponents(view),
  };
}

function renderPreparation(view: BalletClassView): string {
  const selected =
    view.preparation.length === 0
      ? 'No preparation areas marked yet.'
      : view.preparation.map(preparationName).join(' · ');
  const sequence = view.curriculum.sections
    .map((section) => section.displayName + ' (' + section.exercises.length + ')')
    .join(' → ');
  return [
    'Prepare this session at your own pace. Preparation can help with related exercises, but it never blocks class.',
    '',
    '**Marked readiness:** ' + selected,
    '**Class sequence:** ' + sequence,
    '',
    'Choose any preparation areas, then begin when you are ready.',
  ].join('\n');
}

function renderInProgress(view: BalletClassView, latestAttempt?: BalletClassAttempt): string {
  const exercise = view.curriculum.exercises[view.currentExerciseIndex];
  if (exercise === undefined)
    return 'All planned exercises are recorded. The class review is ready.';

  const lines = [
    '**' + sectionName(exercise.section) + ' · ' + exercise.displayName + '**',
    exercise.description,
    '',
    'Exercise ' +
      (view.currentExerciseIndex + 1) +
      ' of ' +
      view.curriculum.exercises.length +
      ' · Difficulty ' +
      exercise.difficulty +
      '/5',
  ];
  if (latestAttempt !== undefined) lines.unshift(formatAttempt(latestAttempt, view.attempts));
  return lines.join('\n');
}

function renderReview(view: BalletClassView): string {
  const review = view.review;
  if (review === null) return 'This completed class has no review snapshot.';
  const sectionLines = review.sections.map(
    (section) =>
      '**' +
      section.displayName +
      '** — ' +
      section.rating.replace('_', ' ') +
      ' · ' +
      section.averageScore +
      '/100 (' +
      section.completedExercises +
      ' exercises)',
  );
  const correctionLines = [
    review.primaryCorrection === null
      ? 'No repeated correction stood out today.'
      : '**Primary correction:** ' +
        correctionName(review.primaryCorrection.category) +
        ' · ' +
        review.primaryCorrection.count +
        ' time(s)',
    review.secondaryCorrection === null
      ? null
      : '**Secondary correction:** ' +
        correctionName(review.secondaryCorrection.category) +
        ' · ' +
        review.secondaryCorrection.count +
        ' time(s)',
  ].filter((line): line is string => line !== null);
  if (review.primaryCorrection !== null) {
    correctionLines.push(
      review.primaryCorrection.count +
        ' notes pointed to ' +
        correctionName(review.primaryCorrection.category).toLowerCase() +
        '. Keep it in mind for a future class.',
    );
  }
  return [
    'A record of this session, based on its saved exercise results.',
    '',
    ...sectionLines,
    '',
    ...correctionLines,
    '',
    'Training evidence: ' + review.completedExercises + ' recorded exercise results.',
  ].join('\n');
}

function formatAttempt(
  attempt: BalletClassAttempt,
  attempts: readonly BalletClassAttempt[],
): string {
  const lines = ['**' + attempt.outcome + ' · ' + attempt.score + '/100**'];
  if (attempt.correction !== null) {
    lines.push(teacherCorrection(attempt.correction.category));
    const repeats = attempts.filter(
      (item) => item.correction?.category === attempt.correction?.category,
    ).length;
    if (repeats > 1) {
      lines.push('That note came back. It will be on the review.');
    }
  } else if (attempt.outcome === 'PERFECT') {
    lines.push('Good. I noticed.');
  } else {
    lines.push('Not bad. Keep the phrasing clear.');
  }
  return lines.join('\n');
}

function teacherCorrection(
  category: NonNullable<BalletClassAttempt['correction']>['category'],
): string {
  const notes: Readonly<Record<typeof category, string>> = {
    BALANCE: 'Balance needs steadier control here.',
    TIMING: 'Stay with the count.',
    FOOTWORK: 'Footwork. Watch the placement through the phrase.',
    TECHNIQUE: 'Keep the technique consistent.',
    COORDINATION: 'Arms and steps need to move together.',
    POSTURE_PLACEMENT: 'Placement. Check it through the phrase.',
    TURN_CONTROL: 'Control the turn. Again.',
    JUMP_CONTROL: 'Land with control. Again.',
    MUSICALITY: 'Listen for the phrase first.',
  };
  return notes[category];
}

function preparationName(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function correctionName(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
