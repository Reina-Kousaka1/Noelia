import { describe, expect, it, vi } from 'vitest';

import { buildBalletClassCurriculum } from '../../src/ballet/class/curriculum.js';
import { BALLET_CLASS_EXERCISES } from '../../src/ballet/class/catalog.js';
import { evaluateBalletExercise, getExerciseOutcome } from '../../src/ballet/class/performance.js';
import { buildBalletClassReview } from '../../src/ballet/class/review.js';
import type { BalletStats } from '../../src/ballet/types.js';
import type { BalletClassAttempt } from '../../src/ballet/class/types.js';
import {
  createBalletClassComponents,
  parseBalletClassComponentId,
} from '../../src/ballet/class/components.js';

const zeroStats: BalletStats = {
  technique: 0,
  flexibility: 0,
  musicality: 0,
  performance: 0,
  pointe: 0,
  stamina: 0,
};

const strongStats: BalletStats = {
  technique: 100,
  flexibility: 100,
  musicality: 100,
  performance: 100,
  pointe: 100,
  stamina: 100,
};

const classId = '250aad21-50a6-4d43-a450-b2c8f8825070';

describe('Ballet Academy class engine', () => {
  it('keeps early-stage class work foundational and excludes advanced sections', () => {
    const curriculum = buildBalletClassCurriculum('minis-bambinis', 'REGULAR', classId);

    expect(curriculum.sections.map((section) => section.id)).toEqual(['BARRE', 'CENTRE']);
    expect(curriculum.exercises.every((exercise) => exercise.minimumStageIndex === 0)).toBe(true);
    expect(curriculum.exercises.some((exercise) => exercise.section === 'TURNS')).toBe(false);
    expect(curriculum.exercises.some((exercise) => exercise.section === 'ALLEGRO')).toBe(false);
    expect(curriculum.exercises.some((exercise) => exercise.section === 'REPERTOIRE')).toBe(false);
  });

  it('unlocks complex sections and fictional repertoire only at their configured stages', () => {
    expect(() => buildBalletClassCurriculum('grade-8', 'REPERTOIRE', classId)).toThrow(
      'Repertoire Class unlocks',
    );
    const curriculum = buildBalletClassCurriculum('solo-seal', 'REGULAR', classId);

    expect(curriculum.sections.map((section) => section.id)).toContain('TURNS');
    expect(curriculum.sections.map((section) => section.id)).toContain('ALLEGRO');
    expect(curriculum.sections.map((section) => section.id)).toContain('REPERTOIRE');
    expect(curriculum.exercises.some((exercise) => exercise.id.startsWith('repertoire-'))).toBe(
      true,
    );
  });

  it('builds the same persisted curriculum snapshot for the same session identity', () => {
    const first = buildBalletClassCurriculum('grade-3', 'REGULAR', classId);
    const resumed = buildBalletClassCurriculum('grade-3', 'REGULAR', classId);
    const another = buildBalletClassCurriculum(
      'grade-3',
      'REGULAR',
      'c0181be5-c932-497a-93a3-d512ddba32bc',
    );

    expect(resumed).toEqual(first);
    expect(another.academyStageId).toBe(first.academyStageId);
    expect(another.exercises).toHaveLength(first.exercises.length);
  });

  it('allows missing or partial preparation and applies a bounded score adjustment', () => {
    const exercise = buildBalletClassCurriculum('minis-bambinis', 'BARRE_FOCUS', classId)
      .exercises[0]!;
    const withoutPreparation = evaluateBalletExercise(exercise, zeroStats, new Set(), 0.5);
    const partial = evaluateBalletExercise(exercise, zeroStats, new Set(['GENERAL_WARM_UP']), 0.5);
    const fullyPrepared = evaluateBalletExercise(
      exercise,
      zeroStats,
      new Set(exercise.preparationRequirements),
      0.5,
    );

    expect(withoutPreparation.score).toBeDefined();
    expect(partial.score).toBeGreaterThanOrEqual(withoutPreparation.score);
    expect(fullyPrepared.score).toBeGreaterThanOrEqual(partial.score);
  });

  it('uses the existing Ballet stats and one injected random roll for performance', () => {
    const exercise = buildBalletClassCurriculum('minis-bambinis', 'BARRE_FOCUS', classId)
      .exercises[0]!;
    const random = vi.fn(() => 0.99);
    const result = evaluateBalletExercise(exercise, strongStats, new Set(), random());

    expect(random).toHaveBeenCalledOnce();
    expect(result.outcome).toBe('PERFECT');
    expect(result.rollMicros).toBe(990_000);
    expect(result.correction).toBeNull();
  });

  it('rewards relevant V3 skills and applies exercise difficulty as a penalty', () => {
    const exercise = buildBalletClassCurriculum('minis-bambinis', 'BARRE_FOCUS', classId)
      .exercises[0]!;
    const skills = {
      balance: 0,
      core_control: 0,
      footwork: 0,
      coordination: 0,
      turn_control: 0,
      jump_control: 0,
      placement: 0,
      musicality: 0,
    };
    const prepared = new Set(exercise.preparationRequirements);
    const baseline = evaluateBalletExercise(exercise, zeroStats, prepared, 0.5);
    const skilled = evaluateBalletExercise(exercise, zeroStats, prepared, 0.5, {
      trainingSkills: { ...skills, placement: 100 },
    });
    const harder = evaluateBalletExercise(
      { ...exercise, difficulty: Math.min(5, exercise.difficulty + 1) },
      zeroStats,
      prepared,
      0.5,
    );

    expect(skilled.score).toBeGreaterThan(baseline.score);
    expect(harder.score).toBeLessThanOrEqual(baseline.score);
  });

  it('covers all four saved gameplay outcomes from fixed stats, preparation, and rolls', () => {
    const beginnerExercise = buildBalletClassCurriculum('minis-bambinis', 'BARRE_FOCUS', classId)
      .exercises[0]!;
    const advancedExercise = BALLET_CLASS_EXERCISES.find(
      (exercise) => exercise.id === 'allegro-grand',
    );
    if (advancedExercise === undefined) throw new Error('The grand allegro exercise is missing.');
    const prepared = new Set(beginnerExercise.preparationRequirements);
    const proficientStats = { ...zeroStats, technique: 20 };

    expect(evaluateBalletExercise(beginnerExercise, strongStats, prepared, 0.99).outcome).toBe(
      'PERFECT',
    );
    expect(evaluateBalletExercise(beginnerExercise, proficientStats, prepared, 0.5).outcome).toBe(
      'SUCCESS',
    );
    expect(evaluateBalletExercise(beginnerExercise, zeroStats, new Set(), 0.5).outcome).toBe(
      'SHAKY',
    );
    expect(evaluateBalletExercise(advancedExercise, zeroStats, new Set(), 0).outcome).toBe('FAIL');
  });

  it('maps the full outcome scale deterministically and rejects invalid random values', () => {
    expect(getExerciseOutcome(92)).toBe('PERFECT');
    expect(getExerciseOutcome(72)).toBe('SUCCESS');
    expect(getExerciseOutcome(45)).toBe('SHAKY');
    expect(getExerciseOutcome(44)).toBe('FAIL');
    expect(() =>
      evaluateBalletExercise(
        buildBalletClassCurriculum('minis-bambinis', 'BARRE_FOCUS', classId).exercises[0]!,
        zeroStats,
        new Set(),
        1,
      ),
    ).toThrow('finite value in [0, 1)');
  });

  it('aggregates repeated corrections into a deterministic class review', () => {
    const curriculum = buildBalletClassCurriculum('minis-bambinis', 'BARRE_FOCUS', classId);
    const attempts: BalletClassAttempt[] = curriculum.exercises.map((exercise, index) => ({
      attemptId: 'attempt-' + index,
      interactionId: 'interaction-' + index,
      exerciseId: exercise.id,
      exerciseName: exercise.displayName,
      section: exercise.section,
      outcome: index === 0 ? 'SHAKY' : 'FAIL',
      score: index === 0 ? 60 : 30,
      rollMicros: 500_000,
      correction: { category: 'FOOTWORK', severity: index === 0 ? 2 : 3 },
      skillSnapshot: zeroStats,
      preparationSnapshot: [],
      attemptedAt: new Date('2026-10-03T12:00:00.000Z'),
    }));
    const review = buildBalletClassReview(curriculum, attempts);

    expect(review.completedExercises).toBe(curriculum.exercises.length);
    expect(review.primaryCorrection).toEqual({ category: 'FOOTWORK', count: 2, severity: 5 });
    expect(buildBalletClassReview(curriculum, attempts)).toEqual(review);
  });

  it('renders preparation controls as stable session-scoped buttons', () => {
    const curriculum = buildBalletClassCurriculum('minis-bambinis', 'BARRE_FOCUS', classId);
    const view = {
      classId,
      discordUserId: '444444444444444444',
      classType: 'BARRE_FOCUS',
      classTypeName: 'Barre Focus',
      academyStageId: 'minis-bambinis',
      academyStageName: 'Minis & Bambinis',
      status: 'PREPARING',
      currentSection: null,
      startedAt: new Date('2026-10-03T12:00:00.000Z'),
      completedAt: null,
      abandonedAt: null,
      currentExerciseIndex: 0,
      curriculum,
      preparation: [],
      attempts: [],
      review: null,
      replayed: false,
    } as const;
    const rows = createBalletClassComponents(view);
    const button = rows[0]?.components[0];
    if (button === undefined || !('custom_id' in button)) {
      throw new Error('Expected a preparation button.');
    }

    expect(button.custom_id).toBe('noelia:ballet-class:' + classId + ':prep:GENERAL_WARM_UP');
    expect(button.custom_id.length).toBeLessThanOrEqual(100);
    expect(
      parseBalletClassComponentId('noelia:ballet-class:' + classId + ':prep:GENERAL_WARM_UP'),
    ).toEqual({ action: 'preparation', classId, area: 'GENERAL_WARM_UP' });
  });
});
