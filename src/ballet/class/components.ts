import * as Eris from 'eris';

import type { BalletClassView } from './types.js';
import { BALLET_PREPARATION_AREAS } from './types.js';

const preparationLabels: Readonly<Record<(typeof BALLET_PREPARATION_AREAS)[number], string>> = {
  GENERAL_WARM_UP: 'Warm-up',
  MOBILITY: 'Mobility',
  CORE_ACTIVATION: 'Core',
  BALANCE: 'Balance',
  BARRE: 'Barre',
  TURNS: 'Turns',
  JUMPS: 'Jumps',
};

export type BalletClassComponentAction =
  | {
      readonly action: 'preparation';
      readonly classId: string;
      readonly area: (typeof BALLET_PREPARATION_AREAS)[number];
    }
  | { readonly action: 'begin'; readonly classId: string }
  | { readonly action: 'attempt'; readonly classId: string; readonly exerciseId: string }
  | { readonly action: 'abandon'; readonly classId: string };

export function parseBalletClassComponentId(customId: string): BalletClassComponentAction | null {
  const parts = customId.split(':');
  if (parts[0] !== 'noelia' || parts[1] !== 'ballet-class') return null;
  const classId = parts[2];
  const action = parts[3];
  if (classId === undefined || !isUuid(classId)) return null;

  if (action === 'prep') {
    const area = parts[4];
    if (area !== undefined && isPreparationArea(area) && parts.length === 5) {
      return { action: 'preparation', classId, area };
    }
    return null;
  }
  if (action === 'begin' && parts.length === 4) return { action: 'begin', classId };
  if (action === 'attempt') {
    const exerciseId = parts[4];
    if (exerciseId !== undefined && /^[a-z0-9-]{1,40}$/.test(exerciseId) && parts.length === 5) {
      return { action: 'attempt', classId, exerciseId };
    }
    return null;
  }
  if (action === 'abandon' && parts.length === 4) return { action: 'abandon', classId };
  return null;
}

export function isBalletClassComponentId(customId: string): boolean {
  return customId.startsWith('noelia:ballet-class:');
}

export function createBalletClassComponents(view: BalletClassView): Eris.ActionRow[] {
  if (view.status === 'COMPLETED' || view.status === 'ABANDONED') return [];

  if (view.status === 'PREPARING') {
    const preparationRows: Eris.ActionRow[] = [];
    for (let start = 0; start < BALLET_PREPARATION_AREAS.length; start += 5) {
      preparationRows.push({
        type: Eris.Constants.ComponentTypes.ACTION_ROW,
        components: BALLET_PREPARATION_AREAS.slice(start, start + 5).map((area) => ({
          type: Eris.Constants.ComponentTypes.BUTTON,
          style: view.preparation.includes(area)
            ? Eris.Constants.ButtonStyles.SUCCESS
            : Eris.Constants.ButtonStyles.SECONDARY,
          custom_id: 'noelia:ballet-class:' + view.classId + ':prep:' + area,
          label: preparationLabels[area],
          disabled: view.preparation.includes(area),
        })),
      });
    }
    preparationRows.push({
      type: Eris.Constants.ComponentTypes.ACTION_ROW,
      components: [
        {
          type: Eris.Constants.ComponentTypes.BUTTON,
          style: Eris.Constants.ButtonStyles.PRIMARY,
          custom_id: 'noelia:ballet-class:' + view.classId + ':begin',
          label: 'Begin class',
        },
        abandonButton(view.classId),
      ],
    });
    return preparationRows;
  }

  const exercise = view.curriculum.exercises[view.currentExerciseIndex];
  if (exercise === undefined) return [];
  return [
    {
      type: Eris.Constants.ComponentTypes.ACTION_ROW,
      components: [
        {
          type: Eris.Constants.ComponentTypes.BUTTON,
          style: Eris.Constants.ButtonStyles.PRIMARY,
          custom_id: 'noelia:ballet-class:' + view.classId + ':attempt:' + exercise.id,
          label: 'Attempt exercise',
        },
        abandonButton(view.classId),
      ],
    },
  ];
}

function abandonButton(classId: string): Eris.Button {
  return {
    type: Eris.Constants.ComponentTypes.BUTTON,
    style: Eris.Constants.ButtonStyles.DANGER,
    custom_id: 'noelia:ballet-class:' + classId + ':abandon',
    label: 'Leave class',
  };
}

function isPreparationArea(value: string): value is (typeof BALLET_PREPARATION_AREAS)[number] {
  return (BALLET_PREPARATION_AREAS as readonly string[]).includes(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
