import { describe, expect, it } from 'vitest';

import { calculatePerformanceScore, getPerformanceTier } from '../../src/performance/scoring.js';

describe('Ballet performance scoring', () => {
  it('uses a transparent weighted average of required stats', () => {
    expect(
      calculatePerformanceScore(
        [
          { key: 'technique', minimum: 20, weight: 3 },
          { key: 'musicality', minimum: 20, weight: 1 },
        ],
        { technique: 80, musicality: 50 },
      ),
    ).toBe(73);
  });

  it('maps stable score bands to non-random presentation tiers', () => {
    expect(getPerformanceTier(54)).toBe('BRONZE');
    expect(getPerformanceTier(55)).toBe('SILVER');
    expect(getPerformanceTier(75)).toBe('GOLD');
    expect(getPerformanceTier(90)).toBe('PRIMA');
  });

  it('rejects missing requirements and scores outside the supported range', () => {
    expect(() => calculatePerformanceScore([], {})).toThrow(RangeError);
    expect(() =>
      calculatePerformanceScore([{ key: 'pointe', minimum: 20, weight: 1 }], { pointe: 19 }),
    ).toThrow(RangeError);
    expect(() => getPerformanceTier(101)).toThrow(RangeError);
  });
});
