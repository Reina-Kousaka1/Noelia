import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { academyCommand } from '../../src/commands/academy/academy.command.js';
import type {
  AcademyAssessmentAttemptView,
  AcademyAssessmentOverview,
} from '../../src/ballet/assessment/types.js';
import { AcademyAssessmentService } from '../../src/ballet/assessment/assessment-service.js';
import type { CommandServices } from '../../src/commands/command.js';

function createInteraction(subcommandName = 'assessment', options?: Eris.InteractionDataOptions[]) {
  const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: '111111111111111111',
    member: { id: '222222222222222222' },
    data: {
      options: [
        {
          type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
          name: subcommandName,
          ...(options === undefined ? {} : { options }),
        },
      ],
    },
    acknowledged: true,
    defer: vi.fn().mockResolvedValue(undefined),
    editOriginalMessage,
  } as unknown as Eris.CommandInteraction;
  return { interaction, editOriginalMessage };
}

const ineligibleOverview: AcademyAssessmentOverview = {
  currentStageId: 'pre-primary',
  currentStageName: 'Pre-Primary',
  targetStageId: 'primary',
  targetStageName: 'Primary',
  eligibility: {
    sourceStageId: 'pre-primary',
    sourceStageName: 'Pre-Primary',
    targetStageId: 'primary',
    targetStageName: 'Primary',
    requirements: [
      { label: 'Reach Ballet level 3', met: false },
      { label: 'Complete 3 different Ballet activities', met: true },
      { label: 'Technique 2+', met: false },
      { label: 'Complete a Ballet class at Pre-Primary', met: false },
    ],
    eligible: false,
    retakeRequiresNewClass: false,
  },
  activeAttempt: null,
  latestAttempt: null,
};

describe('Academy assessment command', () => {
  it('registers the natural /academy assessment flow', () => {
    expect(academyCommand.definition.name).toBe('academy');
    expect(academyCommand.definition.options?.map((option) => option.name)).toEqual([
      'enroll',
      'practice',
      'schedule',
      'cancel',
      'checkin',
      'report',
      'assessment',
    ]);
    expect(
      academyCommand.definition.options?.find((option) => option.name === 'practice'),
    ).toMatchObject({
      options: [
        {
          name: 'action',
          required: true,
          choices: expect.arrayContaining([
            { name: 'Clap the Rhythm', value: 'CLAP_RHYTHM' },
            { name: 'First Positions', value: 'FIRST_POSITIONS' },
          ]),
        },
      ],
    });
  });

  it('shows current stage, target, and concrete missing requirements without starting an attempt', async () => {
    const { interaction, editOriginalMessage } = createInteraction();
    const assessment = {
      getOverview: vi.fn().mockResolvedValue(ineligibleOverview),
      start: vi.fn(),
      answer: vi.fn(),
    } as unknown as AcademyAssessmentService;
    const services = {
      academyAssessment: assessment,
      persona: undefined,
    } as unknown as CommandServices;

    await academyCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(assessment.getOverview).toHaveBeenCalledWith('222222222222222222');
    expect(interaction.defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(assessment.start).not.toHaveBeenCalled();
    expect(editOriginalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            description: expect.stringContaining('Reach Ballet level 3'),
          }),
        ],
        components: [],
      }),
    );
  });

  it('publishes a successful Academy practice result in the channel', async () => {
    const { interaction, editOriginalMessage } = createInteraction('practice', [
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
        name: 'action',
        value: 'CLAP_RHYTHM',
      },
    ]);
    const gameplay = {
      completeBeginnerAction: vi.fn().mockResolvedValue({
        actionName: 'Clap the Rhythm',
        stageId: 'pre-school-dance',
        academyComfort: 10,
        completedActions: ['CLAP_RHYTHM'],
        replayed: false,
      }),
    };
    const services = { academyGameplay: gameplay } as unknown as CommandServices;

    await academyCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(interaction.defer).toHaveBeenCalledWith();
    expect(interaction.defer).not.toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(gameplay.completeBeginnerAction).toHaveBeenCalledWith(
      '111111111111111111',
      '222222222222222222',
      'CLAP_RHYTHM',
    );
    expect(editOriginalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [expect.objectContaining({ title: 'Clap the Rhythm · Foundation recorded' })],
      }),
    );
  });

  it('keeps the personal Academy report book ephemeral', async () => {
    const { interaction, editOriginalMessage } = createInteraction('report');
    const gameplay = {
      getReportBook: vi.fn().mockResolvedValue({
        stageId: 'pre-school-dance',
        stageName: 'Pre-School Dance',
        enrolled: true,
        academyComfort: 10,
        completedActions: [],
        attendedCount: 0,
        excusedCount: 0,
        missedCount: 0,
        systemCancelledCount: 0,
        recentAttendanceStatuses: [],
        entries: [],
      }),
    };
    const services = { academyGameplay: gameplay } as unknown as CommandServices;

    await academyCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(interaction.defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(editOriginalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [expect.objectContaining({ title: 'Maison Noélia · Academy Report Book' })],
      }),
    );
  });

  it('offers start only when every displayed eligibility requirement is met', async () => {
    const { interaction, editOriginalMessage } = createInteraction();
    const ready: AcademyAssessmentOverview = {
      ...ineligibleOverview,
      eligibility: {
        ...ineligibleOverview.eligibility,
        eligible: true,
        requirements: ineligibleOverview.eligibility.requirements.map((requirement) => ({
          ...requirement,
          met: true,
        })),
      },
    };
    const services = {
      academyAssessment: { getOverview: vi.fn().mockResolvedValue(ready) },
    } as unknown as CommandServices;

    await academyCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(editOriginalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        components: [
          expect.objectContaining({
            components: [
              expect.objectContaining({
                custom_id: 'noelia:academy-assessment:start',
              }),
            ],
          }),
        ],
      }),
    );
  });

  it('explains an old Minis-to-Pre-Primary assessment without discarding its history', async () => {
    const { interaction, editOriginalMessage } = createInteraction();
    const completedAt = new Date('2026-10-04T10:00:00.000Z');
    const previousAttempt: AcademyAssessmentAttemptView = {
      attemptId: '250aad21-50a6-4d43-a450-b2c8f8825070',
      sourceStageId: 'minis-bambinis',
      sourceStageName: 'Pre-School Dance',
      targetStageId: 'pre-primary',
      targetStageName: 'Pre-Primary',
      attemptNumber: 1,
      status: 'RETAKE_REQUIRED',
      startedAt: new Date('2026-10-04T09:00:00.000Z'),
      completedAt,
      currentQuestionIndex: 1,
      totalQuestions: 1,
      currentQuestion: null,
      result: {
        status: 'RETAKE_REQUIRED',
        correctAnswers: 0,
        totalQuestions: 1,
        practicalSections: [],
        primaryCorrection: null,
        secondaryCorrection: null,
        completedAt,
        promoted: false,
      },
    };
    const overview: AcademyAssessmentOverview = {
      ...ineligibleOverview,
      currentStageId: 'pre-school-dance',
      currentStageName: 'Pre-School Dance',
      targetStageId: 'preparatory-dance',
      targetStageName: 'Preparatory Dance',
      latestAttempt: previousAttempt,
    };
    const services = {
      academyAssessment: { getOverview: vi.fn().mockResolvedValue(overview) },
      persona: undefined,
    } as unknown as CommandServices;

    await academyCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(editOriginalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            description: expect.stringContaining(
              '**Previous curriculum assessment:** Saved without promotion',
            ),
          }),
        ],
      }),
    );
    expect(JSON.stringify(editOriginalMessage.mock.calls[0])).toContain(
      'Preparatory Dance is now the next stage.',
    );
  });
});
