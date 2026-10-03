import { describe, expect, it } from 'vitest';

import { ACADEMY_CURRICULUM, getBalletAcademyProgressAtStage } from '../../src/ballet/academy.js';
import type { BalletAcademyEvidence } from '../../src/ballet/academy.js';
import { buildAssessmentQuestions } from '../../src/ballet/assessment/assessment-content.js';
import { evaluateAcademyAssessmentEligibility } from '../../src/ballet/assessment/eligibility.js';
import { parseAcademyAssessmentComponentId } from '../../src/ballet/assessment/components.js';
import { evaluateAcademyAssessmentResult } from '../../src/ballet/assessment/result.js';
import type { BalletClassReview } from '../../src/ballet/class/types.js';

const evidence: BalletAcademyEvidence = {
  level: 3,
  completedActivityCodes: ['class', 'stretching', 'barre'],
  bestPerformanceTiers: {},
  technique: 2,
  flexibility: 0,
  musicality: 0,
  performance: 0,
  pointe: 0,
  stamina: 0,
  knowledge: {},
};

const excellentReview: BalletClassReview = {
  sections: [
    {
      section: 'BARRE',
      displayName: 'Barre',
      rating: 'EXCELLENT',
      averageScore: 95,
      completedExercises: 1,
    },
  ],
  completedExercises: 1,
  totalExercises: 1,
  primaryCorrection: null,
  secondaryCorrection: null,
  evidenceCodes: ['tendu-at-barre'],
};

describe('Academy assessment domain', () => {
  it('derives the next stage only from the single canonical curriculum', () => {
    const current = getBalletAcademyProgressAtStage(evidence, 'pre-primary');
    expect(current.currentRank.id).toBe('pre-primary');
    expect(current.nextRank?.id).toBe('primary');
    expect(current.nextRank?.requirements.at(-1)).toEqual({
      label: 'Pass the Primary Academy assessment',
      met: false,
    });
    expect(getBalletAcademyProgressAtStage(evidence, 'solo-seal').nextRank).toBeNull();
    expect(ACADEMY_CURRICULUM).toHaveLength(18);
  });

  it('reports every canonical and practical requirement and does not unlock on level alone', () => {
    const notReady = evaluateAcademyAssessmentEligibility(
      'pre-primary',
      { ...evidence, completedActivityCodes: [], technique: 0 },
      false,
      false,
    );
    expect(notReady.eligible).toBe(false);
    expect(
      notReady.requirements.filter((requirement) => !requirement.met).map((item) => item.label),
    ).toEqual([
      'Complete 3 different Ballet activities',
      'Technique 2+',
      'Complete a Ballet class at Pre-Primary',
    ]);

    const ready = evaluateAcademyAssessmentEligibility('pre-primary', evidence, true, false);
    expect(ready.eligible).toBe(true);
    expect(ready.targetStageId).toBe('primary');
  });

  it('blocks stages beyond Solo Seal and explains a retake class requirement', () => {
    expect(evaluateAcademyAssessmentEligibility('solo-seal', evidence, false, false)).toMatchObject(
      {
        targetStageId: null,
        eligible: false,
        requirements: [],
      },
    );
    const retake = evaluateAcademyAssessmentEligibility('pre-primary', evidence, false, true);
    expect(retake.retakeRequiresNewClass).toBe(true);
    expect(retake.requirements.at(-1)).toEqual({
      label: 'Complete a new Ballet class after the last assessment attempt',
      met: false,
    });
  });

  it('uses stage-relevant existing Knowledge lesson content with deterministic retake rotation', () => {
    const first = buildAssessmentQuestions('grade-3', 1);
    const replay = buildAssessmentQuestions('grade-3', 1);
    const retake = buildAssessmentQuestions('grade-3', 2);
    expect(first).toEqual(replay);
    expect(first[0]?.domain).toBe('ballet_theory');
    expect(first[0]?.id).not.toBe(retake[0]?.id);
    expect(first[0]?.correctAnswerId).toBeDefined();
  });

  it('derives PASS, PASS_WITH_CORRECTIONS, and RETAKE_REQUIRED only from saved evidence', () => {
    const completedAt = new Date('2026-10-03T10:00:00.000Z');
    expect(evaluateAcademyAssessmentResult(excellentReview, 1, 1, completedAt)).toMatchObject({
      status: 'PASS',
      promoted: true,
    });
    expect(
      evaluateAcademyAssessmentResult(
        {
          ...excellentReview,
          primaryCorrection: { category: 'FOOTWORK', count: 1, severity: 1 },
        },
        1,
        1,
        completedAt,
      ),
    ).toMatchObject({
      status: 'PASS_WITH_CORRECTIONS',
      promoted: true,
    });
    expect(evaluateAcademyAssessmentResult(excellentReview, 0, 1, completedAt)).toMatchObject({
      status: 'RETAKE_REQUIRED',
      promoted: false,
    });
    expect(
      evaluateAcademyAssessmentResult(
        {
          ...excellentReview,
          sections: [{ ...excellentReview.sections[0]!, rating: 'NEEDS_ATTENTION' }],
        },
        1,
        1,
        completedAt,
      ).status,
    ).toBe('RETAKE_REQUIRED');
  });

  it('accepts only well-formed assessment button identifiers', () => {
    const attemptId = '250aad21-50a6-4d43-a450-b2c8f8825070';
    expect(parseAcademyAssessmentComponentId('noelia:academy-assessment:start')).toEqual({
      action: 'start',
    });
    expect(
      parseAcademyAssessmentComponentId(
        `noelia:academy-assessment:answer:${attemptId}:ballet-theory-barre-01:b`,
      ),
    ).toEqual({
      action: 'answer',
      attemptId,
      questionId: 'ballet-theory-barre-01',
      answerId: 'b',
    });
    expect(
      parseAcademyAssessmentComponentId(
        `noelia:academy-assessment:answer:${attemptId}:ballet-theory-barre-01:correctAnswerId`,
      ),
    ).toBeNull();
  });
});
