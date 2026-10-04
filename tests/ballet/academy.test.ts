import { describe, expect, it } from 'vitest';

import {
  ACADEMY_CURRICULUM,
  academyStageStorageIds,
  canonicalAcademyStageId,
  getAcademyStageDefinition,
  getBalletAcademyProgress,
  getBalletAcademyProgressAtStage,
} from '../../src/ballet/academy.js';
import type { BalletAcademyEvidence } from '../../src/ballet/academy.js';

const startingEvidence: BalletAcademyEvidence = {
  level: 1,
  completedActivityCodes: [],
  bestPerformanceTiers: {},
  technique: 0,
  flexibility: 0,
  musicality: 0,
  performance: 0,
  stamina: 0,
};

const completeEvidence: BalletAcademyEvidence = {
  level: 100,
  completedActivityCodes: [
    'class',
    'barre',
    'center-practice',
    'stretching',
    'technique',
    'pointe-practice',
    'rehearsal',
    'choreography',
    'performance',
    'audition',
    'recital',
    'showcase',
  ],
  bestPerformanceTiers: {
    'spring-recital': 'PRIMA',
    'moonlit-showcase': 'PRIMA',
    'prima-audition': 'PRIMA',
  },
  knowledge: {
    musicality: 3,
    ballet_french: 3,
    ballet_theory: 3,
    ballet_history: 3,
    french_history_culture: 3,
    academy_history: 3,
    repertoire_studies: 3,
    academy_etiquette: 3,
  },
  technique: 100,
  flexibility: 100,
  musicality: 100,
  performance: 100,
  pointe: 100,
  stamina: 100,
};

describe('Maison Noélia Academy progression', () => {
  it('defines the canonical 19-stage curriculum in the requested order', () => {
    expect(ACADEMY_CURRICULUM.map((stage) => stage.title)).toEqual([
      'Pre-School Dance',
      'Preparatory Dance',
      'Pre-Primary',
      'Primary',
      'Grade 1',
      'Grade 2',
      'Grade 3',
      'Grade 4',
      'Grade 5',
      'Grade 6',
      'Grade 7',
      'Grade 8',
      'Discovering Repertoire',
      'Intermediate Foundation',
      'Intermediate',
      'Advanced Foundation',
      'Advanced 1',
      'Advanced 2',
      'Solo Seal',
    ]);
    expect(ACADEMY_CURRICULUM.map((stage) => stage.id)).toEqual([
      'pre-school-dance',
      'preparatory-dance',
      'pre-primary',
      'primary',
      'grade-1',
      'grade-2',
      'grade-3',
      'grade-4',
      'grade-5',
      'grade-6',
      'grade-7',
      'grade-8',
      'discovering-repertoire',
      'intermediate-foundation',
      'intermediate',
      'advanced-foundation',
      'advanced-1',
      'advanced-2',
      'solo-seal',
    ]);
    expect(ACADEMY_CURRICULUM).toHaveLength(19);
    expect(ACADEMY_CURRICULUM.some((stage) => stage.id === 'minis-bambinis')).toBe(false);
    expect(ACADEMY_CURRICULUM.filter((stage) => stage.id === 'minis')).toHaveLength(0);
    expect(ACADEMY_CURRICULUM.filter((stage) => stage.id === 'bambinis')).toHaveLength(0);
  });

  it('starts in Pre-School Dance and reports Preparatory Dance requirements', () => {
    const result = getBalletAcademyProgress(startingEvidence);

    expect(result.currentRank).toMatchObject({
      id: 'pre-school-dance',
      title: 'Pre-School Dance',
      requirements: [],
    });
    expect(result.nextRank?.title).toBe('Preparatory Dance');
    expect(result.nextRank?.requirements.map((requirement) => requirement.label)).toEqual([
      'Reach Ballet level 2',
      'Complete Class',
    ]);
  });

  it('does not advance on Ballet XP level alone', () => {
    const result = getBalletAcademyProgress({ ...startingEvidence, level: 100 });

    expect(result.currentRank.id).toBe('pre-school-dance');
    expect(result.nextRank?.requirements.some((requirement) => !requirement.met)).toBe(true);
  });

  it('maps only the legacy Minis & Bambinis identifier to Pre-School Dance', () => {
    const legacyFirstStage = getBalletAcademyProgressAtStage(startingEvidence, 'minis-bambinis');
    expect(canonicalAcademyStageId('minis-bambinis')).toBe('pre-school-dance');
    expect(getAcademyStageDefinition('minis-bambinis')?.id).toBe('pre-school-dance');
    expect(academyStageStorageIds('pre-school-dance')).toEqual([
      'pre-school-dance',
      'minis-bambinis',
    ]);
    expect(academyStageStorageIds('minis-bambinis')).toEqual([
      'pre-school-dance',
      'minis-bambinis',
    ]);
    expect(canonicalAcademyStageId('preparatory-dance')).toBe('preparatory-dance');
    expect(academyStageStorageIds('preparatory-dance')).toEqual(['preparatory-dance']);
    expect(legacyFirstStage.currentRank.id).toBe('pre-school-dance');
    expect(legacyFirstStage.nextRank?.id).toBe('preparatory-dance');
    expect(getBalletAcademyProgressAtStage(completeEvidence, 'preparatory-dance')).toMatchObject({
      currentRank: { id: 'preparatory-dance' },
      nextRank: { id: 'pre-primary' },
    });
    expect(getBalletAcademyProgressAtStage(completeEvidence, 'pre-primary').currentRank.id).toBe(
      'pre-primary',
    );
    expect(getBalletAcademyProgressAtStage(completeEvidence, 'pre-primary').nextRank?.id).toBe(
      'primary',
    );
  });

  it('uses completed Knowledge lessons as explicit, non-XP Academy requirements', () => {
    const withoutLessons = getBalletAcademyProgress({ ...completeEvidence, knowledge: {} });
    expect(withoutLessons.currentRank).toMatchObject({ id: 'grade-2', title: 'Grade 2' });
    expect(withoutLessons.nextRank?.requirements).toContainEqual({
      label: 'Complete 1 Ballet Theory Knowledge lesson',
      met: false,
    });

    const partiallyPrepared = getBalletAcademyProgress({
      ...completeEvidence,
      knowledge: { ...completeEvidence.knowledge, repertoire_studies: 2 },
    });
    expect(partiallyPrepared.currentRank.id).toBe('advanced-1');
    expect(partiallyPrepared.nextRank?.requirements).toContainEqual({
      label: 'Complete 3 Repertoire Studies Knowledge lessons',
      met: false,
    });
  });

  it('requires pointe practice only at the advanced foundation stage', () => {
    const result = getBalletAcademyProgress({
      ...completeEvidence,
      level: 24,
      completedActivityCodes: completeEvidence.completedActivityCodes.filter(
        (code) => code !== 'pointe-practice',
      ),
    });

    expect(result.currentRank.id).toBe('intermediate');
    expect(result.nextRank).toMatchObject({
      id: 'advanced-foundation',
      requirements: expect.arrayContaining([{ label: 'Complete Pointe Practice', met: false }]),
    });
  });

  it('requires the top audition tier for Solo Seal and then stops Academy progression', () => {
    const goldResult = getBalletAcademyProgress({
      ...completeEvidence,
      bestPerformanceTiers: { ...completeEvidence.bestPerformanceTiers, 'prima-audition': 'GOLD' },
    });
    expect(goldResult.currentRank.id).toBe('advanced-2');
    expect(goldResult.nextRank?.title).toBe('Solo Seal');
    expect(
      goldResult.nextRank?.requirements.find((requirement) => requirement.label.includes('PRIMA'))
        ?.met,
    ).toBe(false);

    const primaResult = getBalletAcademyProgress(completeEvidence);
    expect(primaResult).toMatchObject({
      currentRank: { id: 'solo-seal', title: 'Solo Seal' },
      nextRank: null,
      completedRankCount: 18,
    });
  });

  it('requires more than a minimum level at every stage after the entry stage', () => {
    expect(
      ACADEMY_CURRICULUM.slice(1).every((stage) =>
        Boolean(
          stage.requiredActivities?.length ||
          stage.minimumDistinctActivities !== undefined ||
          Object.keys(stage.stats ?? {}).length ||
          stage.performance,
        ),
      ),
    ).toBe(true);
  });
});
