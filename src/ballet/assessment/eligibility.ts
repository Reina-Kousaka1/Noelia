import {
  ACADEMY_CURRICULUM,
  evaluateAcademyStageRequirements,
  getAcademyStageIndex,
} from '../academy.js';
import type { BalletAcademyEvidence } from '../academy.js';
import type { AcademyAssessmentEligibility } from './types.js';

export function evaluateAcademyAssessmentEligibility(
  currentStageId: string,
  evidence: BalletAcademyEvidence,
  hasCompletedCurrentStageClass: boolean,
  retakeRequiresNewClass: boolean,
): AcademyAssessmentEligibility {
  const currentIndex = getAcademyStageIndex(currentStageId);
  const currentStage = ACADEMY_CURRICULUM[currentIndex];
  if (currentStage === undefined) throw new Error(`Unknown Academy stage: ${currentStageId}`);

  const targetStage = ACADEMY_CURRICULUM[currentIndex + 1];
  if (targetStage === undefined) {
    return {
      sourceStageId: currentStage.id,
      sourceStageName: currentStage.title,
      targetStageId: null,
      targetStageName: null,
      requirements: [],
      eligible: false,
      retakeRequiresNewClass: false,
    };
  }

  const requirements = [
    ...evaluateAcademyStageRequirements(targetStage.id, evidence),
    {
      label: `Complete a Ballet class at ${currentStage.title}`,
      met: hasCompletedCurrentStageClass,
    },
    ...(retakeRequiresNewClass
      ? [
          {
            label: 'Complete a new Ballet class after the last assessment attempt',
            met: hasCompletedCurrentStageClass,
          },
        ]
      : []),
  ];

  return {
    sourceStageId: currentStage.id,
    sourceStageName: currentStage.title,
    targetStageId: targetStage.id,
    targetStageName: targetStage.title,
    requirements,
    eligible: requirements.every((requirement) => requirement.met),
    retakeRequiresNewClass,
  };
}
