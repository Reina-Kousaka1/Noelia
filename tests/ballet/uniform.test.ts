import { describe, expect, it } from 'vitest';

import { createAcademyUniformStatus } from '../../src/ballet/uniform.js';
import type { AcademyUniformItem } from '../../src/ballet/uniform.js';
import type { BalletAcademyRank } from '../../src/ballet/academy.js';

const student: BalletAcademyRank = {
  id: 'student',
  title: 'Studio Student',
  description: '',
  requirements: [],
};

function item(
  itemId: string,
  displayName: string,
  role: string,
  overrides: Partial<AcademyUniformItem> = {},
): AcademyUniformItem {
  return {
    itemId,
    displayName,
    category: 'uniform',
    minimumBalletLevel: 1,
    roles: [role],
    owned: true,
    equipped: true,
    purchasable: true,
    active: true,
    ...overrides,
  };
}

const basics = [
  item('leo', 'First Class Leotard', 'academy-leotard'),
  item('tights', 'Cloud-Soft Tights', 'academy-tights'),
  item('flats', 'Classic Ballet Flats', 'academy-flat'),
];

describe('Academy uniform policy', () => {
  it('accepts a fully equipped basic uniform for a Studio Student', () => {
    expect(createAcademyUniformStatus(student, basics)).toMatchObject({
      ready: true,
      pointeRequired: false,
      rank: { id: 'student' },
    });
  });

  it('reports missing pieces and alternatives clearly', () => {
    const status = createAcademyUniformStatus(student, [basics[0]!, basics[2]!]);
    expect(status.ready).toBe(false);
    expect(status.pieces.find((piece) => piece.slot === 'tights')).toMatchObject({
      satisfied: false,
      label: 'Ballet tights',
    });
  });

  it('does not let ownership substitute for actually equipping the item', () => {
    const status = createAcademyUniformStatus(student, [
      basics[0]!,
      item('tights', 'Cloud-Soft Tights', 'academy-tights', { equipped: false }),
      basics[2]!,
    ]);
    expect(status.ready).toBe(false);
    expect(status.pieces.find((piece) => piece.slot === 'tights')).toMatchObject({
      satisfied: false,
      ownedAlternatives: ['Cloud-Soft Tights'],
    });
  });

  it('accepts flats for beginners and requires pointe only when the activity policy says so', () => {
    expect(createAcademyUniformStatus(student, basics).ready).toBe(true);
    expect(
      createAcademyUniformStatus(student, [
        basics[0]!,
        basics[1]!,
        item('pointe', 'Pearl Pointe Shoes', 'academy-pointe'),
      ]).ready,
    ).toBe(false);
    const pointeStatus = createAcademyUniformStatus(
      student,
      [basics[0]!, basics[1]!, item('pointe', 'Pearl Pointe Shoes', 'academy-pointe')],
      true,
    );
    expect(pointeStatus).toMatchObject({ ready: true, pointeRequired: true });
    expect(pointeStatus.pieces.find((piece) => piece.slot === 'shoes')?.label).toContain('Pointe');
  });

  it('uses the actual Ballet level for deterministic alternatives when a pointe activity requires them', () => {
    const status = createAcademyUniformStatus(
      student,
      [
        basics[0]!,
        basics[1]!,
        item('pearl-pointe-shoes', 'Pearl Pointe Shoes', 'academy-pointe', {
          equipped: false,
          minimumBalletLevel: 5,
        }),
      ],
      true,
      5,
    );
    expect(status.ready).toBe(false);
    expect(status.pieces.find((piece) => piece.slot === 'shoes')?.availableAlternatives).toEqual([
      'Pearl Pointe Shoes',
    ]);
  });

  it('keeps rank identity in the policy result while using the same non-power uniform baseline', () => {
    const apprentice = { ...student, id: 'apprentice', title: 'Academy Apprentice' };
    const status = createAcademyUniformStatus(apprentice, [
      ...basics,
      item('wrap', 'Rose-Tie Warm-up Wrap', 'academy-apprentice-accent', { equipped: false }),
    ]);
    expect(status).toMatchObject({
      ready: true,
      rank: { id: 'apprentice' },
      optionalRankAccent: {
        label: 'Apprentice wrap',
        equippedItemName: null,
        ownedAlternatives: ['Rose-Tie Warm-up Wrap'],
      },
    });
  });
});
