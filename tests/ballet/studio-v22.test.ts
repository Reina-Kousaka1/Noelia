import { describe, expect, it } from 'vitest';

import {
  easeMood,
  moodAfterAttempt,
  moodAfterIgnoredCorrectiveTask,
  moodDecay,
  nextPatience,
} from '../../src/ballet/studio-v22/rules.js';

describe('Ballet Studio V2.2 rules', () => {
  it('keeps patience distinct from general mood and tolerates an isolated fail', () => {
    expect(nextPatience(3, 'FAIL')).toBe(2);
    expect(moodAfterAttempt('SUPPORTIVE', 'FAIL', 1, 0, 'PREPARED')).toBe('ATTENTIVE');
  });

  it('escalates repeated failures by explicit thresholds and restores patience on success', () => {
    expect(nextPatience(nextPatience(3, 'FAIL'), 'FAIL')).toBe(1);
    expect(nextPatience(1, 'SUCCESS')).toBe(2);
    expect(nextPatience(3, 'PERFECT')).toBe(3);
    expect(moodAfterAttempt('ATTENTIVE', 'FAIL', 2, 0, 'PREPARED')).toBe('CONCERNED');
    expect(moodAfterAttempt('CONCERNED', 'FAIL', 3, 0, 'PREPARED')).toBe('STERN');
    expect(moodAfterAttempt('STERN', 'FAIL', 4, 0, 'PREPARED')).toBe('FRUSTRATED');
  });

  it('tracks preparation gaps, improvement, ignored corrections, and idle easing', () => {
    expect(moodAfterAttempt('SUPPORTIVE', 'SHAKY', 0, 1, 'UNPREPARED')).toBe('ATTENTIVE');
    expect(moodAfterAttempt('ATTENTIVE', 'SHAKY', 0, 3, 'PARTIALLY_PREPARED')).toBe('CONCERNED');
    expect(moodAfterAttempt('CONCERNED', 'SUCCESS', 0, 0, 'PREPARED')).toBe('ATTENTIVE');
    expect(moodAfterIgnoredCorrectiveTask('ATTENTIVE')).toBe('STERN');
    expect(easeMood('FRUSTRATED', 2)).toBe('CONCERNED');
    expect(
      moodDecay(
        'STERN',
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-05T00:00:00.000Z'),
      ),
    ).toEqual({
      mood: 'ATTENTIVE',
      updatedAt: new Date('2026-01-05T00:00:00.000Z'),
      steps: 2,
    });
  });
});
