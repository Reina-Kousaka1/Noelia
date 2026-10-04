import { describe, expect, it } from 'vitest';

import {
  BALLET_TRAINING_V3_RULES,
  applyExerciseCondition,
  applyRecoveryAction,
  conditionScoreModifier,
  createInitialCondition,
  createInitialTrainingSkills,
  nextStaminaCycle,
  recoverConditionOverTime,
  shouldCreateTrainingSetback,
  skillValuesAfterAttempt,
  validateShoeFitProfile,
} from '../../src/ballet/training-v3/rules.js';

describe('Ballet Training V3 rules', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it('keeps the new skill layer separate, bounded, and limited to explicit successful attempts', () => {
    const skills = createInitialTrainingSkills();
    expect(Object.values(skills)).toEqual(Array(8).fill(0));
    expect(skillValuesAfterAttempt(skills, 'Pliés', 'PERFECT', 0)).toMatchObject({
      placement: 2,
      balance: 0,
      core_control: 0,
    });
    expect(skillValuesAfterAttempt(skills, 'Pirouettes', 'SUCCESS', 0)).toMatchObject({
      turn_control: 1,
      balance: 0,
    });
    expect(skillValuesAfterAttempt(skills, 'Tendus', 'FAIL', 0)).toEqual(skills);
    expect(skillValuesAfterAttempt(skills, 'Tendus', 'PERFECT', 5)).toEqual(skills);
    expect(
      skillValuesAfterAttempt({ ...skills, placement: 100 }, 'Pliés', 'PERFECT', 0).placement,
    ).toBe(100);
  });

  it('applies deterministic passive condition recovery without a scheduler', () => {
    const initial = createInitialCondition(now);
    const recovered = recoverConditionOverTime(initial, new Date(now.getTime() + 6 * 3_600_000));
    expect(recovered).toMatchObject({ energy: 82, fatigue: 0, sleepDebt: 0, nutrition: 70 });
    expect(recoverConditionOverTime(initial, new Date(now.getTime() - 1_000))).toEqual(initial);
  });

  it('bounds the condition contribution and records exercise costs as game state', () => {
    expect(
      conditionScoreModifier({
        energy: 100,
        nutrition: 100,
        fatigue: 0,
        sleepDebt: 0,
        updatedAt: now,
      }),
    ).toBe(4);
    expect(
      conditionScoreModifier({
        energy: 0,
        nutrition: 0,
        fatigue: 100,
        sleepDebt: 100,
        updatedAt: now,
      }),
    ).toBe(-10);
    const after = applyExerciseCondition(createInitialCondition(now), 3, now);
    expect(after).toMatchObject({ energy: 64, nutrition: 68, fatigue: 16, sleepDebt: 0 });
  });

  it('uses a cycle deadline and the configured normal half-workload floor', () => {
    const first = nextStaminaCycle(1, 0, now, 0.5, 0.99);
    expect(first.targetWorkload).toBe(BALLET_TRAINING_V3_RULES.staminaCycle.initialTargetWorkload);
    expect(first.belowFloorException).toBe(false);
    expect(nextStaminaCycle(1, 0, now, 0, 0).belowFloorException).toBe(false);
    expect(first.deadlineAt.getTime() - now.getTime()).toBe(168 * 3_600_000);
    const next = nextStaminaCycle(2, 8, now, 0.5, 0);
    expect(next.targetWorkload).toBe(4);
    expect(next.belowFloorException).toBe(false);
    expect(nextStaminaCycle(2, 8, now, 0, 0)).toMatchObject({
      targetWorkload: 3,
      belowFloorException: true,
    });
    expect(nextStaminaCycle(2, 8, now, 0.000000999, 0)).toMatchObject({
      targetWorkload: 3,
      belowFloorException: true,
    });
    expect(nextStaminaCycle(2, 8, now, 0.000001, 0)).toMatchObject({
      targetWorkload: 4,
      belowFloorException: false,
    });
    expect(nextStaminaCycle(2, 1, now, 0, 0)).toMatchObject({
      targetWorkload: 1,
      belowFloorException: false,
    });
  });

  it('keeps rare fictional training setbacks separate from exercise results', () => {
    expect(shouldCreateTrainingSetback('FAIL', 85, 0.004)).toBe(true);
    expect(shouldCreateTrainingSetback('FAIL', 84, 0)).toBe(false);
    expect(shouldCreateTrainingSetback('SUCCESS', 100, 0)).toBe(false);
    expect(shouldCreateTrainingSetback('FAIL', 100, 0.005)).toBe(false);
  });

  it('validates a game-only virtual shoe preference without interpreting it as a real fit', () => {
    expect(validateShoeFitProfile(37.5, 'STANDARD', now)).toMatchObject({
      sizeEu: 37.5,
      fit: 'STANDARD',
      updatedAt: now,
    });
    expect(() => validateShoeFitProfile(37.2, 'STANDARD', now)).toThrow(RangeError);
    expect(() => validateShoeFitProfile(37, 'COMFORT', now)).toThrow(RangeError);
  });

  it('applies recovery actions to persisted game metrics', () => {
    const tired = { energy: 20, nutrition: 30, fatigue: 80, sleepDebt: 50, updatedAt: now };
    expect(applyRecoveryAction(tired, 'REST', now)).toMatchObject({
      energy: 32,
      nutrition: 30,
      fatigue: 62,
      sleepDebt: 50,
    });
    expect(applyRecoveryAction(tired, 'SLEEP', now)).toMatchObject({
      energy: 44,
      fatigue: 68,
      sleepDebt: 26,
    });
    expect(applyRecoveryAction(tired, 'NOURISH', now).nutrition).toBe(52);
  });
});
