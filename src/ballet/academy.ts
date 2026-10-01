import type { PerformanceTier } from '../performance/types.js';

export interface BalletAcademyEvidence {
  readonly level: number;
  readonly completedActivityCodes: readonly string[];
  readonly bestPerformanceTiers: Readonly<Record<string, PerformanceTier>>;
  readonly technique: number;
  readonly musicality: number;
  readonly performance: number;
}

export interface AcademyRequirementProgress {
  readonly label: string;
  readonly met: boolean;
}

export interface BalletAcademyRank {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requirements: readonly AcademyRequirementProgress[];
}

export interface BalletAcademyProgress {
  readonly currentRank: BalletAcademyRank;
  readonly nextRank: BalletAcademyRank | null;
  readonly completedRankCount: number;
}

const rankDefinitions = [
  {
    id: 'apprentice',
    title: 'Academy Apprentice',
    description: 'Build a steady studio foundation across several kinds of class.',
    requirements: (evidence: BalletAcademyEvidence): AcademyRequirementProgress[] => [
      { label: 'Reach Ballet level 5', met: evidence.level >= 5 },
      {
        label: 'Complete 4 different Ballet activities',
        met: new Set(evidence.completedActivityCodes).size >= 4,
      },
      { label: 'Technique 6+', met: evidence.technique >= 6 },
    ],
  },
  {
    id: 'repertoire-artist',
    title: 'Repertoire Artist',
    description: 'Connect rehearsal, choreography, and audition preparation.',
    requirements: (evidence: BalletAcademyEvidence): AcademyRequirementProgress[] => [
      { label: 'Reach Ballet level 12', met: evidence.level >= 12 },
      {
        label: 'Complete Rehearsal, Choreography, and Audition',
        met: ['rehearsal', 'choreography', 'audition'].every((code) =>
          evidence.completedActivityCodes.includes(code),
        ),
      },
      { label: 'Musicality 15+', met: evidence.musicality >= 15 },
      { label: 'Performance 10+', met: evidence.performance >= 10 },
    ],
  },
  {
    id: 'soloist',
    title: 'Soloist',
    description: 'Earn a Silver or higher result in the Spring Recital.',
    requirements: (evidence: BalletAcademyEvidence): AcademyRequirementProgress[] => [
      { label: 'Reach Ballet level 20', met: evidence.level >= 20 },
      {
        label: 'Complete the Recital activity',
        met: evidence.completedActivityCodes.includes('recital'),
      },
      {
        label: 'Earn Silver or higher in Spring Recital',
        met: tierAtLeast(evidence.bestPerformanceTiers['spring-recital'], 'SILVER'),
      },
    ],
  },
  {
    id: 'principal-artist',
    title: 'Principal Artist',
    description: 'Bring the full studio journey together in a Prima Audition.',
    requirements: (evidence: BalletAcademyEvidence): AcademyRequirementProgress[] => [
      { label: 'Reach Ballet level 35', met: evidence.level >= 35 },
      {
        label: 'Complete the Showcase activity',
        met: evidence.completedActivityCodes.includes('showcase'),
      },
      {
        label: 'Earn Gold or Prima in the Prima Audition',
        met: tierAtLeast(evidence.bestPerformanceTiers['prima-audition'], 'GOLD'),
      },
    ],
  },
] as const;

const startingRank: BalletAcademyRank = {
  id: 'student',
  title: 'Studio Student',
  description: 'Your Ballet journey begins with the next class.',
  requirements: [],
};

const tierOrder: Readonly<Record<PerformanceTier, number>> = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
  PRIMA: 3,
};

export function getBalletAcademyProgress(evidence: BalletAcademyEvidence): BalletAcademyProgress {
  let currentRank = startingRank;
  let nextRank: BalletAcademyRank | null = null;
  let completedRankCount = 0;

  for (const definition of rankDefinitions) {
    const requirements = definition.requirements(evidence);
    const rank: BalletAcademyRank = {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      requirements,
    };
    if (requirements.every((requirement) => requirement.met)) {
      currentRank = rank;
      completedRankCount += 1;
      continue;
    }
    nextRank = rank;
    break;
  }

  return { currentRank, nextRank, completedRankCount };
}

function tierAtLeast(actual: PerformanceTier | undefined, minimum: PerformanceTier): boolean {
  return actual !== undefined && tierOrder[actual] >= tierOrder[minimum];
}
