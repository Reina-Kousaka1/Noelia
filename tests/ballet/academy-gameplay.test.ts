import { describe, expect, it } from 'vitest';

import {
  ACADEMY_BEGINNER_ACTIONS,
  calculateAcademyReportGrades,
  evaluateEarlyAcademyRequirements,
  getAvailableBeginnerActions,
  isStructuredTrainingUnlocked,
  missedAcademyReport,
  resolveMadameAttendanceTone,
  resolveMadameAttendanceToneFromHistory,
  scoreToGrade,
} from '../../src/ballet/academy-gameplay.js';
import type { BalletClassReview } from '../../src/ballet/class/types.js';

const excellentReview: BalletClassReview = {
  sections: [
    {
      section: 'BARRE',
      displayName: 'Barre',
      rating: 'EXCELLENT',
      averageScore: 96,
      completedExercises: 2,
    },
    {
      section: 'CENTRE',
      displayName: 'Centre',
      rating: 'EXCELLENT',
      averageScore: 92,
      completedExercises: 2,
    },
  ],
  completedExercises: 4,
  totalExercises: 4,
  primaryCorrection: null,
  secondaryCorrection: null,
  evidenceCodes: ['barre', 'centre'],
};

describe('early Academy gameplay', () => {
  it('starts with rhythm and movement foundations, then unlocks early Ballet vocabulary', () => {
    expect(getAvailableBeginnerActions('pre-school-dance').map((action) => action.code)).toEqual([
      'CLAP_RHYTHM',
      'FIND_THE_BEAT',
      'WALK_TO_THE_BEAT',
      'FOLLOW_THE_MUSIC',
      'SIMPLE_MOVEMENT_PATTERN',
    ]);
    expect(
      getAvailableBeginnerActions('preparatory-dance').map((action) => action.code),
    ).toHaveLength(9);
    expect(getAvailableBeginnerActions('grade-1')).toHaveLength(9);
    expect(getAvailableBeginnerActions('minis-bambinis')).toHaveLength(5);
    expect(ACADEMY_BEGINNER_ACTIONS).toHaveLength(9);
    expect(isStructuredTrainingUnlocked('pre-school-dance')).toBe(false);
    expect(isStructuredTrainingUnlocked('preparatory-dance')).toBe(false);
    expect(isStructuredTrainingUnlocked('minis-bambinis')).toBe(false);
    expect(isStructuredTrainingUnlocked('pre-primary')).toBe(true);
  });

  it('requires enrollment, beginner evidence, comfort and attended class reports for early promotion', () => {
    const blocked = evaluateEarlyAcademyRequirements('preparatory-dance', {
      enrolled: false,
      completedActions: [],
      academyComfort: 0,
      attendedScheduledClasses: 0,
      acceptableReportCards: 0,
    });
    expect(blocked.filter((requirement) => !requirement.met)).toHaveLength(7);
    expect(
      blocked.find((requirement) => requirement.label.includes('unexcused absences'))?.met,
    ).toBe(true);
    const ready = evaluateEarlyAcademyRequirements('preparatory-dance', {
      enrolled: true,
      completedActions: ['CLAP_RHYTHM', 'FIND_THE_BEAT', 'WALK_TO_THE_BEAT', 'FOLLOW_THE_MUSIC'],
      academyComfort: 8,
      attendedScheduledClasses: 1,
      acceptableReportCards: 1,
      missedScheduledClasses: 0,
    });
    expect(ready.every((requirement) => requirement.met)).toBe(true);
    expect(
      evaluateEarlyAcademyRequirements('pre-primary', {
        enrolled: true,
        completedActions: [
          'FIRST_POSITIONS',
          'SIMPLE_PLIES',
          'SIMPLE_PORT_DE_BRAS',
          'RHYTHM_SEQUENCE',
        ],
        academyComfort: 20,
        attendedScheduledClasses: 2,
        acceptableReportCards: 1,
      }).every((requirement) => requirement.met),
    ).toBe(false);
  });

  it('uses a deterministic 1–6 scale and gives early stages rhythm/coordination weight', () => {
    expect([95, 85, 75, 65, 55, 45].map(scoreToGrade)).toEqual([1, 2, 3, 4, 5, 6]);
    const preschool = calculateAcademyReportGrades('pre-school-dance', excellentReview, 4);
    const preparatory = calculateAcademyReportGrades('preparatory-dance', excellentReview, 4);
    expect(preschool).toMatchObject({
      rhythm: 1,
      technique: null,
      coordination: 1,
      participation: 1,
    });
    expect(preparatory.overall).toBe(1);
  });

  it('records missed class participation without changing or inventing Ballet skill grades', () => {
    expect(missedAcademyReport()).toEqual({
      rhythm: null,
      technique: null,
      coordination: null,
      preparation: null,
      participation: 6,
      overall: 6,
    });
  });

  it('keeps Academy discipline bounded and excludes excused or system cancellations', () => {
    expect(resolveMadameAttendanceTone(0, 4, 0)).toBe('NEUTRAL');
    expect(resolveMadameAttendanceTone(3, 0, 0)).toBe('APPROVING');
    expect(resolveMadameAttendanceTone(1, 2, 1)).toBe('FIRM');
    expect(resolveMadameAttendanceTone(10, 20, 30)).toBe('STRICT');
    expect(() => resolveMadameAttendanceTone(-1, 0, 0)).toThrow(RangeError);
    expect(
      resolveMadameAttendanceToneFromHistory([
        'ATTENDED',
        'ATTENDED',
        'ATTENDED',
        'ATTENDED',
        'ATTENDED',
        'MISSED_UNEXCUSED',
      ]),
    ).toBe('APPROVING');
    expect(
      resolveMadameAttendanceToneFromHistory([
        'SYSTEM_CANCELLED',
        'CANCELLED_EXCUSED',
        'MISSED_UNEXCUSED',
      ]),
    ).toBe('FIRM');
  });
});
