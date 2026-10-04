import type { PerformanceTier } from '../performance/types.js';
import type { KnowledgeDomain } from '../knowledge/catalog.js';

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

export interface AcademyStageDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly minimumLevel: number;
  readonly requiredActivities?: readonly string[];
  readonly minimumDistinctActivities?: number;
  readonly stats?: Partial<Readonly<Record<AcademyStat, number>>>;
  readonly knowledgeLessons?: Partial<Readonly<Record<KnowledgeDomain, number>>>;
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
    knowledgeLessons: { ballet_theory: 1 },
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
    knowledgeLessons: { musicality: 1 },
  },
  {
    id: 'grade-6',
    title: 'Grade 6',
    description: 'Begin linking class work to focused rehearsal.',
    minimumLevel: 9,
    requiredActivities: ['rehearsal'],
    stats: { performance: 5 },
    knowledgeLessons: { ballet_french: 1 },
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
    knowledgeLessons: { academy_etiquette: 1 },
  },
  {
    id: 'discovering-repertoire',
    title: 'Discovering Repertoire',
    description: 'Explore rehearsal, choreography, and audition preparation.',
    minimumLevel: 12,
    requiredActivities: ['rehearsal', 'choreography', 'audition'],
    stats: { musicality: 12, performance: 10 },
    knowledgeLessons: { repertoire_studies: 2 },
  },
  {
    id: 'intermediate-foundation',
    title: 'Intermediate Foundation',
    description: 'Consolidate technique and earn a first recital distinction.',
    minimumLevel: 15,
    requiredActivities: ['recital'],
    stats: { technique: 15, performance: 12 },
    performance: { id: 'spring-recital', tier: 'SILVER' },
    knowledgeLessons: { ballet_history: 2 },
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    description: 'Develop stamina and artistry across a sustained showcase.',
    minimumLevel: 20,
    requiredActivities: ['showcase'],
    stats: { musicality: 20, performance: 20, stamina: 15 },
    performance: { id: 'moonlit-showcase', tier: 'SILVER' },
    knowledgeLessons: { french_history_culture: 2 },
  },
  {
    id: 'advanced-foundation',
    title: 'Advanced Foundation',
    description: 'Begin advanced pointe work with the required prior preparation.',
    minimumLevel: 25,
    requiredActivities: ['pointe-practice'],
    stats: { technique: 30, pointe: 15, stamina: 20 },
    knowledgeLessons: { academy_history: 2 },
  },
  {
    id: 'advanced-1',
    title: 'Advanced 1',
    description: 'Unite advanced technique with a strong audition result.',
    minimumLevel: 30,
    requiredActivities: ['audition', 'recital'],
    stats: { technique: 40, performance: 35, pointe: 20 },
    performance: { id: 'prima-audition', tier: 'SILVER' },
    knowledgeLessons: { ballet_theory: 3 },
  },
  {
    id: 'advanced-2',
    title: 'Advanced 2',
    description: 'Demonstrate mature control across pointe and stage practice.',
    minimumLevel: 35,
    requiredActivities: ['pointe-practice', 'showcase'],
    stats: { technique: 55, performance: 50, pointe: 25, stamina: 30 },
    performance: { id: 'prima-audition', tier: 'GOLD' },
    knowledgeLessons: { repertoire_studies: 3 },
  },
  {
    id: 'solo-seal',
    title: 'Solo Seal',
    description: 'Complete the current Academy journey with a distinguished audition.',
    minimumLevel: 40,
    requiredActivities: ['pointe-practice', 'showcase'],
    stats: { technique: 70, musicality: 60, performance: 70, pointe: 40, stamina: 40 },
    performance: { id: 'prima-audition', tier: 'PRIMA' },
    knowledgeLessons: { musicality: 3, academy_etiquette: 3 },
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

/** Return the canonical definition for a persisted Academy stage identifier. */
export function getAcademyStageDefinition(stageId: string): AcademyStageDefinition | undefined {
  return ACADEMY_CURRICULUM.find((stage) => stage.id === canonicalAcademyStageId(stageId));
}

export function getAcademyStageIndex(stageId: string): number {
  return ACADEMY_CURRICULUM.findIndex((stage) => stage.id === canonicalAcademyStageId(stageId));
}

/** Historical stage IDs remain valid in immutable snapshots and baseline rows. */
export function canonicalAcademyStageId(stageId: string): string {
  if (stageId === 'pre-school-dance') return 'minis-bambinis';
  if (stageId === 'preparatory-dance') return 'pre-primary';
  return stageId;
}

/** Persisted aliases keep class and assessment snapshots readable after stage consolidation. */
export function academyStageStorageIds(stageId: string): readonly string[] {
  const canonicalId = canonicalAcademyStageId(stageId);
  if (canonicalId === 'minis-bambinis') return ['minis-bambinis', 'pre-school-dance'];
  if (canonicalId === 'pre-primary') return ['pre-primary', 'preparatory-dance'];
  return [canonicalId];
}

/** The ordered Knowledge domains used by an assessment for this canonical target stage. */
export function getAssessmentKnowledgeDomains(stageId: string): readonly KnowledgeDomain[] {
  const stage = getAcademyStageDefinition(stageId);
  if (stage === undefined) return [];
  const domains = Object.keys(stage.knowledgeLessons ?? {}) as KnowledgeDomain[];
  return domains.length > 0 ? domains.sort() : ['ballet_theory'];
}

/** Evaluate the same canonical requirements used by the legacy stage derivation. */
export function evaluateAcademyStageRequirements(
  stageId: string,
  evidence: BalletAcademyEvidence,
): readonly AcademyRequirementProgress[] {
  const stage = getAcademyStageDefinition(stageId);
  if (stage === undefined) throw new Error(`Unknown Academy stage: ${stageId}`);
  return evaluateRequirements(stage, evidence);
}

/**
 * Render progress from an assessment-controlled persisted stage. This does not
 * change the legacy evidence-only derivation above; callers opt into this view
 * only after the user's pre-assessment stage has been recorded as a baseline.
 */
export function getBalletAcademyProgressAtStage(
  evidence: BalletAcademyEvidence,
  currentStageId: string,
): BalletAcademyProgress {
  const currentIndex = getAcademyStageIndex(currentStageId);
  const currentStage = ACADEMY_CURRICULUM[currentIndex];
  if (currentStage === undefined) throw new Error(`Unknown Academy stage: ${currentStageId}`);

  const currentRank = toRank(
    currentStage,
    currentIndex === 0 ? [] : evaluateRequirements(currentStage, evidence),
  );
  const nextStage = ACADEMY_CURRICULUM[currentIndex + 1];
  if (nextStage === undefined) {
    return { currentRank, nextRank: null, completedRankCount: currentIndex };
  }

  const requirements = [
    ...evaluateRequirements(nextStage, evidence),
    { label: `Pass the ${nextStage.title} Academy assessment`, met: false },
  ];
  return {
    currentRank,
    nextRank: toRank(nextStage, requirements),
    completedRankCount: currentIndex,
  };
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
  for (const [domain, minimum] of Object.entries(stage.knowledgeLessons ?? {}) as [
    KnowledgeDomain,
    number,
  ][]) {
    const domainName = KNOWLEDGE_DOMAIN_NAMES[domain];
    requirements.push({
      label: `Complete ${minimum} ${domainName} Knowledge lesson${minimum === 1 ? '' : 's'}`,
      met: (evidence.knowledge?.[domain] ?? 0) >= minimum,
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

const KNOWLEDGE_DOMAIN_NAMES: Readonly<Record<KnowledgeDomain, string>> = {
  musicality: 'Musicality',
  ballet_french: 'Ballet French',
  ballet_theory: 'Ballet Theory',
  ballet_history: 'Ballet History',
  french_history_culture: 'French History & Culture',
  academy_history: 'Academy History',
  repertoire_studies: 'Repertoire Studies',
  academy_etiquette: 'Academy Etiquette',
};

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
