import { describe, expect, it } from 'vitest';

import { getBalletAcademyProgress } from '../../src/ballet/academy.js';
import type { BalletAcademyEvidence } from '../../src/ballet/academy.js';

const startingEvidence: BalletAcademyEvidence = {
  level: 1,
  completedActivityCodes: [],
  bestPerformanceTiers: {},
  technique: 0,
  musicality: 0,
  performance: 0,
};

describe('Ballet Academy progression', () => {
  it('starts at Studio Student and explains the next rank requirements', () => {
    const result = getBalletAcademyProgress(startingEvidence);

    expect(result.currentRank.title).toBe('Studio Student');
    expect(result.nextRank?.title).toBe('Academy Apprentice');
    expect(result.nextRank?.requirements.every((requirement) => !requirement.met)).toBe(true);
  });

  it('derives ranks from existing Ballet level, activity, stat, and performance evidence', () => {
    const result = getBalletAcademyProgress({
      level: 35,
      completedActivityCodes: [
        'class',
        'barre',
        'center-practice',
        'stretching',
        'rehearsal',
        'choreography',
        'audition',
        'recital',
        'showcase',
      ],
      bestPerformanceTiers: { 'spring-recital': 'SILVER', 'prima-audition': 'GOLD' },
      technique: 80,
      musicality: 40,
      performance: 50,
    });

    expect(result).toMatchObject({
      currentRank: { id: 'principal-artist', title: 'Principal Artist' },
      nextRank: null,
      completedRankCount: 4,
    });
  });

  it('does not promote on levels alone or treat a low stage tier as a pass', () => {
    const result = getBalletAcademyProgress({
      ...startingEvidence,
      level: 20,
      completedActivityCodes: [
        'class',
        'barre',
        'center-practice',
        'stretching',
        'rehearsal',
        'choreography',
        'audition',
        'recital',
      ],
      bestPerformanceTiers: { 'spring-recital': 'BRONZE' },
      technique: 9,
      musicality: 15,
      performance: 10,
    });

    expect(result.currentRank.id).toBe('repertoire-artist');
    expect(
      result.nextRank?.requirements.find((requirement) =>
        requirement.label.includes('Silver or higher'),
      )?.met,
    ).toBe(false);
  });
});
