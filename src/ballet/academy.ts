import type { PerformanceTier } from '../performance/types.js';

export interface BalletAcademyEvidence {
  readonly level: number;
  readonly completedActivityCodes: readonly string[];
  readonly bestPerformanceTiers: Readonly<Record<string, PerformanceTier>>;
  readonly technique: number;
  readonly flexibility?: number;
  readonly musicality: number;
  readonly performance: number;
  readonly pointe?: number;
  readonly stamina?: number;
  readonly knowledge?: Readonly<Record<string, number>>;
  readonly completedLessons?: readonly string[];
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

type AcademyStat =
  'technique' | 'flexibility' | 'musicality' | 'performance' | 'pointe' | 'stamina';

interface AcademyStageDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly minimumLevel: number;
  readonly requiredActivities?: readonly string[];
  readonly minimumDistinctActivities?: number;
  readonly stats?: Partial<Readonly<Record<AcademyStat, number>>>;
  readonly performance?: {
    readonly id: string;
    readonly tier: PerformanceTier;
  };
}

/**
 * The single canonical Academy curriculum. Thresholds are centralized here
 * and are initial gameplay defaults, not representations of any real ballet
 * certification. Knowledge/assessment requirements can be added here without
 * creating a second progression source.
 */
export const ACADEMY_CURRICULUM: readonly AcademyStageDefinition[] = [
  {
    id: 'minis-bambinis',
    title: 'Minis & Bambinis',
    description: 'A welcoming first studio for ballet foundations.',
    minimumLevel: 1,
  },
  {
    id: 'pre-primary',
    title: 'Pre-Primary',
    description: 'Discover class rhythm, gentle mobility, and studio habits.',
    minimumLevel: 2,
    requiredActivities: ['class', 'stretching'],
  },
  {
    id: 'primary',
    title: 'Primary',
    description: 'Build a broader foundation through regular studio practice.',
    minimumLevel: 3,
    minimumDistinctActivities: 3,
    stats: { technique: 2 },
  },
  {
    id: 'grade-1',
    title: 'Grade 1',
    description: 'Develop steady barre and foundational technique.',
    minimumLevel: 4,
    requiredActivities: ['barre'],
    stats: { technique: 3 },
  },
  {
    id: 'grade-2',
    title: 'Grade 2',
    description: 'Bring balance and musical phrasing into practice.',
    minimumLevel: 5,
    requiredActivities: ['center-practice'],
    stats: { musicality: 3 },
  },
  {
    id: 'grade-3',
    title: 'Grade 3',
    description: 'Strengthen control, mobility, and consistent studio work.',
    minimumLevel: 6,
    minimumDistinctActivities: 4,
    stats: { flexibility: 4, stamina: 2 },
  },
  {
    id: 'grade-4',
    title: 'Grade 4',
    description: 'Refine detail and dependable technical placement.',
    minimumLevel: 7,
    requiredActivities: ['technique'],
    stats: { technique: 6 },
  },
  {
    id: 'grade-5',
    title: 'Grade 5',
    description: 'Connect foundational skills across different class formats.',
    minimumLevel: 8,
    minimumDistinctActivities: 5,
    stats: { flexibility: 6, stamina: 4 },
  },
  {
    id: 'grade-6',
    title: 'Grade 6',
    description: 'Begin linking class work to focused rehearsal.',
    minimumLevel: 9,
    requiredActivities: ['rehearsal'],
    stats: { performance: 5 },
  },
  {
    id: 'grade-7',
    title: 'Grade 7',
    description: 'Shape combinations with musical and expressive intention.',
    minimumLevel: 10,
    requiredActivities: ['choreography'],
    stats: { musicality: 8, performance: 7 },
  },
  {
    id: 'grade-8',
    title: 'Grade 8',
    description: 'Prepare confidently for more demanding stage work.',
    minimumLevel: 11,
    requiredActivities: ['performance'],
    minimumDistinctActivities: 6,
    stats: { technique: 10, stamina: 7 },
  },
  {
    id: 'discovering-repertoire',
    title: 'Discovering Repertoire',
    description: 'Explore rehearsal, choreography, and audition preparation.',
    minimumLevel: 12,
    requiredActivities: ['rehearsal', 'choreography', 'audition'],
    stats: { musicality: 12, performance: 10 },
  },
  {
    id: 'intermediate-foundation',
    title: 'Intermediate Foundation',
    description: 'Consolidate technique and earn a first recital distinction.',
    minimumLevel: 15,
    requiredActivities: ['recital'],
    stats: { technique: 15, performance: 12 },
    performance: { id: 'spring-recital', tier: 'SILVER' },
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    description: 'Develop stamina and artistry across a sustained showcase.',
    minimumLevel: 20,
    requiredActivities: ['showcase'],
    stats: { musicality: 20, performance: 20, stamina: 15 },
    performance: { id: 'moonlit-showcase', tier: 'SILVER' },
  },
  {
    id: 'advanced-foundation',
    title: 'Advanced Foundation',
    description: 'Begin advanced pointe work with the required prior preparation.',
    minimumLevel: 25,
    requiredActivities: ['pointe-practice'],
    stats: { technique: 30, pointe: 15, stamina: 20 },
  },
  {
    id: 'advanced-1',
    title: 'Advanced 1',
    description: 'Unite advanced technique with a strong audition result.',
    minimumLevel: 30,
    requiredActivities: ['audition', 'recital'],
    stats: { technique: 40, performance: 35, pointe: 20 },
    performance: { id: 'prima-audition', tier: 'SILVER' },
  },
  {
    id: 'advanced-2',
    title: 'Advanced 2',
    description: 'Demonstrate mature control across pointe and stage practice.',
    minimumLevel: 35,
    requiredActivities: ['pointe-practice', 'showcase'],
    stats: { technique: 55, performance: 50, pointe: 25, stamina: 30 },
    performance: { id: 'prima-audition', tier: 'GOLD' },
  },
  {
    id: 'solo-seal',
    title: 'Solo Seal',
    description: 'Complete the current Academy journey with a distinguished audition.',
    minimumLevel: 40,
    requiredActivities: ['pointe-practice', 'showcase'],
    stats: { technique: 70, musicality: 60, performance: 70, pointe: 40, stamina: 40 },
    performance: { id: 'prima-audition', tier: 'PRIMA' },
  },
];

const tierOrder: Readonly<Record<PerformanceTier, number>> = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
  PRIMA: 3,
};

export function getBalletAcademyProgress(evidence: BalletAcademyEvidence): BalletAcademyProgress {
  const firstStage = ACADEMY_CURRICULUM[0];
  if (firstStage === undefined) throw new Error('The Academy curriculum has no starting stage.');

  let currentRank = toRank(firstStage, []);
  let nextRank: BalletAcademyRank | null = null;
  let completedRankCount = 0;

  for (const stage of ACADEMY_CURRICULUM.slice(1)) {
    const requirements = evaluateRequirements(stage, evidence);
    const rank = toRank(stage, requirements);
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

function evaluateRequirements(
  stage: AcademyStageDefinition,
  evidence: BalletAcademyEvidence,
): AcademyRequirementProgress[] {
  const requirements: AcademyRequirementProgress[] = [
    {
      label: `Reach Ballet level ${stage.minimumLevel}`,
      met: evidence.level >= stage.minimumLevel,
    },
  ];
  for (const code of stage.requiredActivities ?? []) {
    requirements.push({
      label: `Complete ${activityName(code)}`,
      met: evidence.completedActivityCodes.includes(code),
    });
  }
  if (stage.minimumDistinctActivities !== undefined) {
    requirements.push({
      label: `Complete ${stage.minimumDistinctActivities} different Ballet activities`,
      met: new Set(evidence.completedActivityCodes).size >= stage.minimumDistinctActivities,
    });
  }
  for (const [key, minimum] of Object.entries(stage.stats ?? {}) as [AcademyStat, number][]) {
    requirements.push({
      label: `${capitalize(key)} ${minimum}+`,
      met: ((evidence[key] as number | undefined) ?? 0) >= minimum,
    });
  }
  if (stage.performance !== undefined) {
    requirements.push({
      label: `Earn ${stage.performance.tier} or higher in ${performanceName(stage.performance.id)}`,
      met: tierAtLeast(evidence.bestPerformanceTiers[stage.performance.id], stage.performance.tier),
    });
  }
  return requirements;
}

function toRank(
  stage: AcademyStageDefinition,
  requirements: readonly AcademyRequirementProgress[],
): BalletAcademyRank {
  return {
    id: stage.id,
    title: stage.title,
    description: stage.description,
    requirements,
  };
}

function tierAtLeast(actual: PerformanceTier | undefined, minimum: PerformanceTier): boolean {
  return actual !== undefined && tierOrder[actual] >= tierOrder[minimum];
}

function activityName(code: string): string {
  return code.split('-').map(capitalize).join(' ');
}

function performanceName(id: string): string {
  return id.split('-').map(capitalize).join(' ');
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
