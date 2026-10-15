import { describe, expect, it } from 'vitest';

import { BalletTrainingCooldownError } from '../../src/ballet/training-v3/errors.js';
import {
  BALLET_TRAINING_V3_RULES,
  applyExerciseCondition,
  applyRecoveryAction,
  conditionScoreModifier,
  cycleDurationDays,
  createInitialCondition,
  createInitialTrainingSkills,
  finalizeStaminaPeriod,
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
    expect(createInitialCondition(now).consistencyStamina).toBe(100);
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
        consistencyStamina: 100,
        energy: 100,
        nutrition: 100,
        fatigue: 0,
        sleepDebt: 0,
        updatedAt: now,
      }),
    ).toBe(4);
    expect(
      conditionScoreModifier({
        consistencyStamina: 100,
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

  it('creates bounded weekly preparation periods and honors the exact rare half-target exception', () => {
    const first = nextStaminaCycle(1, 0, now, 0.5, 0.99);
    expect(first.targetWorkload).toBe(BALLET_TRAINING_V3_RULES.staminaCycle.initialTargetWorkload);
    expect(first.belowFloorException).toBe(false);
    expect(nextStaminaCycle(1, 0, now, 0, 0).belowFloorException).toBe(false);
    expect(first.durationDays).toBe(7);
    expect(first.deadlineAt.getTime() - now.getTime()).toBe(7 * 24 * 3_600_000);
    expect(first.floorRollMicros).toBe(500_000);
    expect(first.targetRollMicros).toBe(990_000);
    const next = nextStaminaCycle(2, 15, now, 0.5, 0, 20);
    expect(next.targetWorkload).toBe(17);
    expect(next.belowFloorException).toBe(false);
    expect(nextStaminaCycle(2, 15, now, 0, 0, 20)).toMatchObject({
      targetWorkload: 9,
      belowFloorException: true,
    });
    expect(nextStaminaCycle(2, 15, now, 0.000000999, 0, 20)).toMatchObject({
      targetWorkload: 9,
      belowFloorException: true,
    });
    expect(nextStaminaCycle(2, 15, now, 0.000001, 0, 20)).toMatchObject({
      targetWorkload: 17,
      belowFloorException: false,
    });
    expect(nextStaminaCycle(2, 1, now, 0, 0, 1)).toMatchObject({
      targetWorkload: 1,
      belowFloorException: false,
    });
    expect(cycleDurationDays(20)).toBe(7);
    expect(cycleDurationDays(40)).toBe(14);
    expect(cycleDurationDays(63)).toBe(21);
    expect(cycleDurationDays(70)).toBe(42);
    expect(() => cycleDurationDays(71)).toThrow(RangeError);
    expect(() => nextStaminaCycle(2, 21, now, 0.5, 0.5, 20)).toThrow(RangeError);
    expect(() => nextStaminaCycle(2, 20, now, 0.5, 0.5, 71)).toThrow(RangeError);
    expect(nextStaminaCycle(2, 20, now, 0.9, 0.999, 20).targetWorkload).toBeLessThanOrEqual(70);
    expect(nextStaminaCycle(2, 20, now, 0.9, 0.999, 63).durationDays).toBe(42);
    expect(nextStaminaCycle(2, 63, now, 0.9, 0, 63)).toMatchObject({
      targetWorkload: 63,
      durationDays: 21,
    });
    expect(nextStaminaCycle(2, 63, now, 0.9, 0.999, 63)).toMatchObject({
      targetWorkload: 70,
      durationDays: 42,
    });
    expect(() => nextStaminaCycle(2, 20, now, 1, 0.5, 20)).toThrow(RangeError);
    const acrossUtcDst = nextStaminaCycle(1, 0, new Date('2026-03-28T12:00:00.000Z'), 0.5, 0.5);
    expect(acrossUtcDst.deadlineAt.toISOString()).toBe('2026-04-04T12:00:00.000Z');
  });

  it('changes long-term stamina only when a preparation period is finalized', () => {
    const completed = nextStaminaCycle(1, 0, now, 0.5, 0.5);
    expect(finalizeStaminaPeriod({ ...completed, completedWorkload: 20 }, 100, now)).toEqual({
      stamina: 102,
      delta: 2,
      outcome: 'WEEKLY_GOAL_COMPLETED',
    });
    expect(finalizeStaminaPeriod({ ...completed, completedWorkload: 15 }, 100, now)).toEqual({
      stamina: 101,
      delta: 1,
      outcome: 'WEEKLY_GOAL_MISSED',
    });
    expect(finalizeStaminaPeriod({ ...completed, completedWorkload: 14 }, 100, now)).toEqual({
      stamina: 100,
      delta: 0,
      outcome: 'WEEKLY_GOAL_MISSED',
    });
    expect(finalizeStaminaPeriod({ ...completed, completedWorkload: 20 }, 150, now).stamina).toBe(
      150,
    );
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
    const tired = {
      consistencyStamina: 100,
      energy: 20,
      nutrition: 30,
      fatigue: 80,
      sleepDebt: 50,
      updatedAt: now,
    };
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

  it.each([
    ['REST', 'Rest'],
    ['SLEEP', 'Sleep'],
    ['NOURISH', 'Nourish'],
    ['REHABILITATE', 'Rehabilitate'],
  ] as const)('reports %s with a human-friendly remaining duration', (action, label) => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const nextAllowedAt = new Date(now.getTime() + 102 * 60_000);

    expect(new BalletTrainingCooldownError(action, nextAllowedAt, now).userMessage).toBe(
      `${label} is available again in 1h 42m.`,
    );
    expect(
      new BalletTrainingCooldownError('NOURISH', new Date(now.getTime() + 42 * 60_000), now)
        .userMessage,
    ).toBe('Nourish is available again in 42m.');
  });
});
