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
      'Madame: ' +
        review.primaryCorrection.count +
        ' notes pointed to ' +
        correctionName(review.primaryCorrection.category).toLowerCase() +
        '. Keep that observation with you for a future class.',
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
      lines.push(
        'Madame noticed this same note returning in class; it will be reflected in the review.',
      );
    }
  } else if (attempt.outcome === 'PERFECT') {
    lines.push('Très bien, ma chère. Beautifully controlled.');
  } else {
    lines.push('Good work. Keep that clear musical phrasing.');
  }
  return lines.join('\n');
}

function teacherCorrection(
  category: NonNullable<BalletClassAttempt['correction']>['category'],
): string {
  const notes: Readonly<Record<typeof category, string>> = {
    BALANCE: 'Madame: Balance needs steadier attention in this combination.',
    TIMING: 'Madame: Stay with the musical counts, ma chère.',
    FOOTWORK: 'Madame: Keep the footwork precise as the phrase moves on.',
    TECHNIQUE: 'Madame: Let the technique stay consistent through the sequence.',
    COORDINATION: 'Madame: Let the arms and steps travel together more smoothly.',
    POSTURE_PLACEMENT: 'Madame: Keep your placement in mind through the phrase.',
    TURN_CONTROL: 'Madame: The turn needs calmer control in this gameplay sequence.',
    JUMP_CONTROL: 'Madame: Keep the landing controlled in this gameplay sequence.',
    MUSICALITY: 'Madame: Listen for the phrase before you move.',
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
