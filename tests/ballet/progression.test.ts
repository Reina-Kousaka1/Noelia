import { describe, expect, it } from 'vitest';

import {
  BALLET_XP_PER_LEVEL,
  getBalletLevel,
  getXpToNextLevel,
  MAX_BALLET_LEVEL,
} from '../../src/ballet/progression.js';

describe('Ballet progression', () => {
  it('starts at level 1 and advances each 100 XP', () => {
    expect(getBalletLevel(0n)).toBe(1);
    expect(getBalletLevel(99n)).toBe(1);
    expect(getBalletLevel(100n)).toBe(2);
    expect(getBalletLevel(199n)).toBe(2);
    expect(getBalletLevel(200n)).toBe(3);
  });

  it('reports XP remaining to the next level and caps levels at the defined maximum', () => {
    expect(getXpToNextLevel(0n)).toBe(BALLET_XP_PER_LEVEL);
    expect(getXpToNextLevel(98n)).toBe(2n);
    expect(getBalletLevel(BigInt(MAX_BALLET_LEVEL - 1) * BALLET_XP_PER_LEVEL)).toBe(
      MAX_BALLET_LEVEL,
    );
    expect(getXpToNextLevel(BigInt(MAX_BALLET_LEVEL - 1) * BALLET_XP_PER_LEVEL)).toBeNull();
  });

  it('rejects negative total XP', () => {
    expect(() => getBalletLevel(-1n)).toThrow(RangeError);
  });
});
