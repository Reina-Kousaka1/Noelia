import { describe, expect, it } from 'vitest';

import { ACADEMY_HISTORY } from '../../src/ballet/academy-history.js';

describe('fictional Maison Noélia Academy history', () => {
  it('preserves the Académie as the origin and heart of the Maison', () => {
    expect(ACADEMY_HISTORY[0]?.body).toContain('Académie de Ballet Noélia');
    expect(
      ACADEMY_HISTORY.find((chapter) => chapter.id === 'the-birth-of-maison-noelia')?.body,
    ).toContain('the Maison’s heart');
  });

  it('keeps the institutional history as content rather than gameplay policy', () => {
    expect(ACADEMY_HISTORY.map((chapter) => chapter.id)).toEqual([
      'the-original-studio',
      'the-first-academy-classes',
      'the-growth-of-the-academie',
      'expansion-of-the-curriculum',
      'the-first-etoile',
      'the-birth-of-maison-noelia',
      'maison-noelia-today',
    ]);
    expect(
      ACADEMY_HISTORY.every((chapter) => chapter.title.length > 0 && chapter.body.length > 0),
    ).toBe(true);
  });
});
