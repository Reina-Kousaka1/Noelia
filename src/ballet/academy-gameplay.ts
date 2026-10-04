import { getAcademyStageIndex } from './academy.js';
import type { BalletClassReview } from './class/types.js';

export type AcademyBeginnerActionCode =
  | 'CLAP_RHYTHM'
  | 'FIND_THE_BEAT'
  | 'WALK_TO_THE_BEAT'
  | 'FOLLOW_THE_MUSIC'
  | 'SIMPLE_MOVEMENT_PATTERN'
  | 'FIRST_POSITIONS'
  | 'SIMPLE_PLIES'
  | 'SIMPLE_PORT_DE_BRAS'
  | 'RHYTHM_SEQUENCE';

export interface AcademyBeginnerActionDefinition {
  readonly code: AcademyBeginnerActionCode;
  readonly name: string;
  readonly description: string;
  readonly minimumStageId: 'pre-school-dance' | 'preparatory-dance';
  readonly familiarityGain: number;
}

export const ACADEMY_BEGINNER_ACTIONS: readonly AcademyBeginnerActionDefinition[] = [
  {
    code: 'CLAP_RHYTHM',
    name: 'Clap the Rhythm',
    description: 'Listen to a short musical phrase and follow its steady counts.',
    minimumStageId: 'pre-school-dance',
    familiarityGain: 2,
  },
  {
    code: 'FIND_THE_BEAT',
    name: 'Find the Beat',
    description: 'Notice the pulse before adding any movement.',
    minimumStageId: 'pre-school-dance',
    familiarityGain: 2,
  },
  {
    code: 'WALK_TO_THE_BEAT',
    name: 'Walk to the Beat',
    description: 'Try a simple walking pattern that follows the music.',
    minimumStageId: 'pre-school-dance',
    familiarityGain: 2,
  },
  {
    code: 'FOLLOW_THE_MUSIC',
    name: 'Follow the Music',
    description: 'Listen for the phrase and respond with a gentle movement cue.',
    minimumStageId: 'pre-school-dance',
    familiarityGain: 2,
  },
  {
    code: 'SIMPLE_MOVEMENT_PATTERN',
    name: 'Simple Movement Pattern',
    description: 'Repeat a short movement sequence in the studio space.',
    minimumStageId: 'pre-school-dance',
    familiarityGain: 2,
  },
  {
    code: 'FIRST_POSITIONS',
    name: 'First Positions',
    description: 'Learn the names and order of the Academy’s first position shapes.',
    minimumStageId: 'preparatory-dance',
    familiarityGain: 3,
  },
  {
    code: 'SIMPLE_PLIES',
    name: 'Simple Pliés',
    description: 'Explore a gentle, counted plié phrase at the barre.',
    minimumStageId: 'preparatory-dance',
    familiarityGain: 3,
  },
  {
    code: 'SIMPLE_PORT_DE_BRAS',
    name: 'Simple Port de Bras',
    description: 'Coordinate a simple arm pathway with the musical count.',
    minimumStageId: 'preparatory-dance',
    familiarityGain: 3,
  },
  {
    code: 'RHYTHM_SEQUENCE',
    name: 'Rhythm Sequence',
    description: 'Join a short rhythm pattern to a basic movement phrase.',
    minimumStageId: 'preparatory-dance',
    familiarityGain: 3,
  },
];

/** V3 skill/condition effects join the existing loop at Pre-Primary, after the starter stages. */
export function isStructuredTrainingUnlocked(stageId: string): boolean {
  return getAcademyStageIndex(stageId) >= getAcademyStageIndex('pre-primary');
}

const preschoolMilestones: readonly AcademyBeginnerActionCode[] = [
  'CLAP_RHYTHM',
  'FIND_THE_BEAT',
  'WALK_TO_THE_BEAT',
  'FOLLOW_THE_MUSIC',
];
const preparatoryMilestones: readonly AcademyBeginnerActionCode[] = [
  'FIRST_POSITIONS',
  'SIMPLE_PLIES',
  'SIMPLE_PORT_DE_BRAS',
  'RHYTHM_SEQUENCE',
];

export interface EarlyAcademyEvidence {
  readonly enrolled: boolean;
  readonly completedActions: readonly AcademyBeginnerActionCode[];
  readonly academyComfort: number;
  readonly attendedScheduledClasses: number;
  readonly acceptableReportCards: number;
  readonly missedScheduledClasses?: number;
}

export interface EarlyAcademyRequirement {
  readonly label: string;
  readonly met: boolean;
}

export function getAvailableBeginnerActions(
  currentStageId: string,
): readonly AcademyBeginnerActionDefinition[] {
  const currentIndex = getAcademyStageIndex(currentStageId);
  if (currentIndex < 0) return [];
  return ACADEMY_BEGINNER_ACTIONS.filter(
    (action) => currentIndex >= getAcademyStageIndex(action.minimumStageId),
  );
}

export function evaluateEarlyAcademyRequirements(
  targetStageId: string,
  evidence: EarlyAcademyEvidence,
): readonly EarlyAcademyRequirement[] {
  if (targetStageId === 'preparatory-dance') {
    return [
      { label: 'Enroll in Maison Noélia — Académie de Ballet', met: evidence.enrolled },
      ...preschoolMilestones.map((code) => ({
        label: actionRequirementLabel(code),
        met: evidence.completedActions.includes(code),
      })),
      {
        label: 'Build at least 8 Academy comfort points through beginner foundations',
        met: evidence.academyComfort >= 8,
      },
      {
        label: 'Attend and complete one scheduled Academy class with an acceptable report',
        met: evidence.attendedScheduledClasses >= 1 && evidence.acceptableReportCards >= 1,
      },
      {
        label: 'Keep unexcused absences to at most one during the starter stage',
        met: (evidence.missedScheduledClasses ?? 0) <= 1,
      },
    ];
  }
  if (targetStageId === 'pre-primary') {
    return [
      ...preparatoryMilestones.map((code) => ({
        label: actionRequirementLabel(code),
        met: evidence.completedActions.includes(code),
      })),
      {
        label: 'Build at least 20 Academy comfort points through structured foundations',
        met: evidence.academyComfort >= 20,
      },
      {
        label: 'Attend two scheduled Academy classes and earn two acceptable reports',
        met: evidence.attendedScheduledClasses >= 2 && evidence.acceptableReportCards >= 2,
      },
      {
        label: 'Keep unexcused absences to at most one during Preparatory Dance',
        met: (evidence.missedScheduledClasses ?? 0) <= 1,
      },
    ];
  }
  return [];
}

function actionRequirementLabel(code: AcademyBeginnerActionCode): string {
  const action = ACADEMY_BEGINNER_ACTIONS.find((candidate) => candidate.code === code);
  return `Complete ${action?.name ?? code.toLowerCase().replaceAll('_', ' ')}`;
}

export function averageAcceptableGrade(grades: readonly number[]): number | null {
  if (
    grades.length === 0 ||
    grades.some((grade) => !Number.isInteger(grade) || grade < 1 || grade > 6)
  ) {
    return null;
  }
  return grades.reduce((total, grade) => total + grade, 0) / grades.length;
}

export interface AcademyReportGrades {
  readonly rhythm: number | null;
  readonly technique: number | null;
  readonly coordination: number | null;
  readonly preparation: number | null;
  readonly participation: number;
  readonly overall: number;
}

export function calculateAcademyReportGrades(
  stageId: string,
  review: BalletClassReview,
  preparationCount: number,
): AcademyReportGrades {
  if (!Number.isInteger(preparationCount) || preparationCount < 0 || preparationCount > 7) {
    throw new RangeError('Academy class preparation count must be between 0 and 7.');
  }
  const scoreFor = (sections: readonly string[]): number | null => {
    const scores = review.sections
      .filter((section) => sections.includes(section.section))
      .map((section) => section.averageScore);
    return scores.length === 0
      ? null
      : Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
  };
  const rhythmScore = scoreFor(['BARRE', 'CENTRE', 'ADAGIO', 'TURNS', 'ALLEGRO']);
  const techniqueScore = scoreFor(['BARRE', 'TECHNIQUE']);
  const coordinationScore = scoreFor(['CENTRE', 'ADAGIO', 'TURNS', 'ALLEGRO']);
  const rhythm = scoreToGrade(rhythmScore ?? 60);
  const techniqueValue = scoreToGrade(techniqueScore ?? 60);
  const coordination = scoreToGrade(coordinationScore ?? 60);
  const preparation = scoreToGrade(Math.min(100, 50 + preparationCount * 8));
  const participation = 1;
  const stageIndex = getAcademyStageIndex(stageId);
  const technique = stageIndex <= 0 ? null : techniqueValue;
  const weightedScore =
    stageIndex <= 0
      ? rhythm * 0.4 + coordination * 0.35 + preparation * 0.2 + participation * 0.05
      : stageIndex === 1
        ? rhythm * 0.25 +
          techniqueValue * 0.25 +
          coordination * 0.25 +
          preparation * 0.15 +
          participation * 0.1
        : rhythm * 0.15 +
          techniqueValue * 0.35 +
          coordination * 0.2 +
          preparation * 0.2 +
          participation * 0.1;
  return {
    rhythm,
    technique,
    coordination,
    preparation,
    participation,
    overall: Math.max(1, Math.min(6, Math.round(weightedScore))),
  };
}

export function scoreToGrade(score: number): number {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError('Academy report score must be between 0 and 100.');
  }
  if (score >= 90) return 1;
  if (score >= 80) return 2;
  if (score >= 70) return 3;
  if (score >= 60) return 4;
  if (score >= 50) return 5;
  return 6;
}

export function missedAcademyReport(): AcademyReportGrades {
  // An absence is a participation record only; it never changes technical skills.
  return {
    rhythm: null,
    technique: null,
    coordination: null,
    preparation: null,
    participation: 6,
    overall: 6,
  };
}

export type MadameAttendanceTone = 'APPROVING' | 'NEUTRAL' | 'FIRM' | 'STRICT';
export type AcademyAttendanceStatus =
  'SCHEDULED' | 'ATTENDED' | 'CANCELLED_EXCUSED' | 'MISSED_UNEXCUSED' | 'SYSTEM_CANCELLED';

/** A bounded, deterministic presentation derived only from saved attendance history. */
export function resolveMadameAttendanceTone(
  attendedCount: number,
  excusedCount: number,
  missedCount: number,
): MadameAttendanceTone {
  for (const count of [attendedCount, excusedCount, missedCount]) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('Academy attendance counts must be non-negative integers.');
    }
  }
  if (missedCount >= 3) return 'STRICT';
  if (missedCount > 0) return 'FIRM';
  if (attendedCount >= 2) return 'APPROVING';
  return 'NEUTRAL';
}

/** Uses recent persisted history so steady attendance can restore a neutral, warmer tone. */
export function resolveMadameAttendanceToneFromHistory(
  newestFirst: readonly AcademyAttendanceStatus[],
): MadameAttendanceTone {
  const relevant = newestFirst
    .filter((status) => status === 'ATTENDED' || status === 'MISSED_UNEXCUSED')
    .slice(0, 5);
  const attended = relevant.filter((status) => status === 'ATTENDED').length;
  const missed = relevant.length - attended;
  return resolveMadameAttendanceTone(attended, 0, missed);
}
