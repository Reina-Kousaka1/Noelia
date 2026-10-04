import { createHash } from 'node:crypto';

import { ACADEMY_CURRICULUM, canonicalAcademyStageId } from '../academy.js';
import { BALLET_CLASS_EXERCISES, BALLET_CLASS_TYPE_CATALOG } from './catalog.js';
import { BalletClassRequirementError } from './errors.js';
import type {
  BalletClassCurriculumSnapshot,
  BalletClassSectionSnapshot,
  BalletClassType,
} from './types.js';

export function isBalletClassType(value: string): value is BalletClassType {
  return BALLET_CLASS_TYPE_CATALOG.some((definition) => definition.id === value);
}

export function buildBalletClassCurriculum(
  academyStageId: string,
  classType: BalletClassType,
  classId: string,
): BalletClassCurriculumSnapshot {
  const stageIndex = ACADEMY_CURRICULUM.findIndex(
    (stage) => stage.id === canonicalAcademyStageId(academyStageId),
  );
  const stage = ACADEMY_CURRICULUM[stageIndex];
  if (stage === undefined)
    throw new Error('The stored Academy stage is not in the canonical curriculum.');

  const type = BALLET_CLASS_TYPE_CATALOG.find((definition) => definition.id === classType);
  if (type === undefined)
    throw new BalletClassRequirementError('That class type is not available.');
  // The class catalog's numeric gates were authored for the original 18 stages.
  // Keep their named unlock points stable after inserting Preparatory Dance.
  const classStageIndex = stageIndex > 1 ? stageIndex - 1 : 0;
  if (classStageIndex < type.minimumStageIndex) {
    throw new BalletClassRequirementError(
      `${type.displayName} unlocks at ${ACADEMY_CURRICULUM[type.minimumStageIndex + (type.minimumStageIndex > 0 ? 1 : 0)]?.title ?? 'a later Academy stage'}.`,
    );
  }

  const sections: BalletClassSectionSnapshot[] = [];
  for (const plan of type.sections) {
    if (plan.minimumStageIndex !== undefined && classStageIndex < plan.minimumStageIndex) continue;
    const candidates = BALLET_CLASS_EXERCISES.filter(
      (exercise) =>
        exercise.section === plan.section && exercise.minimumStageIndex <= classStageIndex,
    ).toSorted((left, right) => left.id.localeCompare(right.id));
    if (candidates.length === 0) continue;
    const start = sectionOffset(classId, plan.section, candidates.length);
    const selected = Array.from(
      { length: Math.min(plan.count, candidates.length) },
      (_, index) => candidates[(start + index) % candidates.length]!,
    );
    sections.push({
      id: plan.section,
      displayName: sectionName(plan.section),
      exercises: selected,
    });
  }

  const exercises = sections.flatMap((section) => section.exercises);
  if (exercises.length === 0)
    throw new Error(`No exercises are configured for ${type.displayName}.`);

  return {
    version: 1,
    classType: type.id,
    classTypeName: type.displayName,
    academyStageId,
    academyStageName: academyStageId === 'minis-bambinis' ? 'Minis & Bambinis' : stage.title,
    sections,
    exercises,
  };
}

function sectionOffset(classId: string, section: string, candidateCount: number): number {
  const digest = createHash('sha256').update(`${classId}\u0000${section}`).digest();
  return digest.readUInt32BE(0) % candidateCount;
}

export function sectionName(section: string): string {
  const names: Readonly<Record<string, string>> = {
    BARRE: 'Barre',
    CENTRE: 'Centre',
    ADAGIO: 'Adagio',
    TURNS: 'Turns',
    ALLEGRO: 'Allegro',
    TECHNIQUE: 'Technique',
    CONDITIONING: 'Conditioning',
    REPERTOIRE: 'Repertoire',
  };
  return names[section] ?? section;
}
