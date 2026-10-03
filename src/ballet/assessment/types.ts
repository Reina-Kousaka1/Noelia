import type { BalletClassReview } from '../class/types.js';
import type { KnowledgeDomain } from '../../knowledge/catalog.js';

export type AcademyAssessmentStatus =
  'IN_PROGRESS' | 'PASS' | 'PASS_WITH_CORRECTIONS' | 'RETAKE_REQUIRED';

export interface AcademyAssessmentQuestionSnapshot {
  readonly id: string;
  readonly domain: KnowledgeDomain;
  readonly domainName: string;
  readonly title: string;
  readonly question: string;
  readonly answers: readonly { readonly id: string; readonly label: string }[];
  readonly correctAnswerId: string;
  readonly explanation: string;
}

export type AcademyAssessmentQuestion = Omit<
  AcademyAssessmentQuestionSnapshot,
  'correctAnswerId' | 'explanation'
>;

export interface AcademyAssessmentRequirement {
  readonly label: string;
  readonly met: boolean;
}

export interface AcademyAssessmentEligibility {
  readonly sourceStageId: string;
  readonly sourceStageName: string;
  readonly targetStageId: string | null;
  readonly targetStageName: string | null;
  readonly requirements: readonly AcademyAssessmentRequirement[];
  readonly eligible: boolean;
  readonly retakeRequiresNewClass: boolean;
}

export interface AcademyAssessmentResult {
  readonly status: Exclude<AcademyAssessmentStatus, 'IN_PROGRESS'>;
  readonly correctAnswers: number;
  readonly totalQuestions: number;
  readonly practicalSections: BalletClassReview['sections'];
  readonly primaryCorrection: BalletClassReview['primaryCorrection'];
  readonly secondaryCorrection: BalletClassReview['secondaryCorrection'];
  readonly completedAt: Date;
  readonly promoted: boolean;
}

export interface AcademyAssessmentAttemptView {
  readonly attemptId: string;
  readonly sourceStageId: string;
  readonly sourceStageName: string;
  readonly targetStageId: string;
  readonly targetStageName: string;
  readonly attemptNumber: number;
  readonly status: AcademyAssessmentStatus;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly currentQuestionIndex: number;
  readonly totalQuestions: number;
  readonly currentQuestion: AcademyAssessmentQuestion | null;
  readonly result: AcademyAssessmentResult | null;
}

export interface AcademyAssessmentOverview {
  readonly currentStageId: string;
  readonly currentStageName: string;
  readonly targetStageId: string | null;
  readonly targetStageName: string | null;
  readonly eligibility: AcademyAssessmentEligibility;
  readonly activeAttempt: AcademyAssessmentAttemptView | null;
  readonly latestAttempt: AcademyAssessmentAttemptView | null;
}

export interface AcademyAssessmentPort {
  getOverview(discordUserId: string): Promise<AcademyAssessmentOverview>;
  start(interactionId: string, discordUserId: string): Promise<AcademyAssessmentAttemptView>;
  answer(
    interactionId: string,
    discordUserId: string,
    attemptId: string,
    questionId: string,
    answerId: string,
  ): Promise<AcademyAssessmentAttemptView>;
}
