import * as Eris from 'eris';

import type { AcademyAssessmentOverview } from '../../ballet/assessment/types.js';
import { createAcademyAssessmentComponents } from '../../ballet/assessment/components.js';
import { completeCommand, deferCommand } from '../../interactions/response-policy.js';
import { createPersonaEmbedRenderer } from '../../persona/presentation.js';
import { createNoeliaEmbed } from '../../ui/embed.js';
import {
  ACADEMY_BEGINNER_ACTIONS,
  getAvailableBeginnerActions,
  resolveMadameAttendanceToneFromHistory,
} from '../../ballet/academy-gameplay.js';
import type { AcademyBeginnerActionCode } from '../../ballet/academy-gameplay.js';
import type { SlashCommand } from '../command.js';

const subcommand = Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND;
const stringOption = Eris.Constants.ApplicationCommandOptionTypes.STRING;
const beginnerActionChoices = ACADEMY_BEGINNER_ACTIONS.map((action) => ({
  name: action.name,
  value: action.code,
}));

export const academyCommand: SlashCommand = {
  definition: {
    name: 'academy',
    description: 'Review your Maison Noélia Academy standing and assessments.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'enroll',
        description: 'Begin your Maison Noélia Academy journey and receive starter studio wear.',
        type: subcommand,
      },
      {
        name: 'practice',
        description: 'Practice one of the foundations unlocked at your current Academy stage.',
        type: subcommand,
        options: [
          {
            name: 'action',
            description: 'Choose a beginner Academy foundation.',
            type: stringOption,
            required: true,
            choices: beginnerActionChoices,
          },
        ],
      },
      {
        name: 'schedule',
        description: 'Book a future Academy class in an IANA timezone.',
        type: subcommand,
        options: [
          {
            name: 'date',
            description: 'Local date in YYYY-MM-DD format.',
            type: stringOption,
            required: true,
          },
          {
            name: 'time',
            description: 'Local 24-hour time in HH:MM format.',
            type: stringOption,
            required: true,
          },
          {
            name: 'timezone',
            description: 'IANA timezone, for example Europe/Berlin.',
            type: stringOption,
            required: true,
          },
        ],
      },
      {
        name: 'cancel',
        description: 'Cancel a booked class at least one hour before it starts.',
        type: subcommand,
        options: [
          {
            name: 'class_id',
            description: 'Scheduled class ID from /academy report.',
            type: stringOption,
            required: true,
          },
        ],
      },
      {
        name: 'checkin',
        description: 'Check in during the 30-minute Academy class window.',
        type: subcommand,
        options: [
          {
            name: 'class_id',
            description: 'Scheduled class ID from /academy report.',
            type: stringOption,
            required: true,
          },
        ],
      },
      {
        name: 'report',
        description: 'Review your Academy attendance, beginner foundations, and report grades.',
        type: subcommand,
      },
      {
        name: 'assessment',
        description: 'Review readiness, resume, or begin your next Academy assessment.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;
    if (discordUserId === undefined)
      throw new Error('The Academy command requires a server member.');
    const selected = interaction.data.options?.[0] as SelectedSubcommand | undefined;
    if (selected === undefined || selected.type !== subcommand) {
      throw new Error('The Academy command requires a subcommand.');
    }
    await deferCommand(interaction, 'ephemeral');

    if (selected.name !== 'assessment') {
      const gameplay = services.academyGameplay;
      if (gameplay === undefined)
        throw new Error('The Academy gameplay service is not configured.');

      if (selected.name === 'enroll') {
        const result = await gameplay.enroll(interaction.id, discordUserId);
        const wear =
          result.starterWear.length > 0
            ? `\n\nYour one-time Academy Hand-Me-Downs are ready and equipped: ${result.starterWear.join(', ')}. They cannot be sold or traded.`
            : '';
        await completeCommand(interaction, {
          embeds: [
            createNoeliaEmbed({
              title: result.replayed ? 'Academy enrollment' : 'Welcome to the Academy',
              description: `**Current stage:** ${result.stageName}\nYour Academy journey begins with rhythm, listening, movement, and studio basics. There is no ballet experience requirement.${wear}${result.replayed ? '\n\nYour enrollment is already saved; no duplicate starter items were granted.' : ''}`,
            }),
          ],
        });
        return;
      }

      if (selected.name === 'practice') {
        const action = readOption(selected, 'action');
        if (
          action === undefined ||
          !ACADEMY_BEGINNER_ACTIONS.some((item) => item.code === action)
        ) {
          throw new Error('Choose one of the listed Academy foundations.');
        }
        const result = await gameplay.completeBeginnerAction(
          interaction.id,
          discordUserId,
          action as AcademyBeginnerActionCode,
        );
        await completeCommand(interaction, {
          embeds: [
            createNoeliaEmbed({
              title: `${result.actionName} · Foundation recorded`,
              description: `**Academy stage:** ${result.stageId}\n**Academy comfort:** ${result.academyComfort}/100 · fictional game progress only\nCompleted foundations available at this stage: ${result.completedActions.filter((code) => getAvailableBeginnerActions(result.stageId).some((action) => action.code === code)).length}/${getAvailableBeginnerActions(result.stageId).length}.${result.replayed ? '\nThis is the saved result for your interaction; no progress was added twice.' : ''}`,
              tone: 'success',
            }),
          ],
        });
        return;
      }

      if (selected.name === 'schedule') {
        if (interaction.guildID === undefined) throw new Error('Academy classes require a server.');
        const date = readOption(selected, 'date');
        const time = readOption(selected, 'time');
        const timeZone = readOption(selected, 'timezone');
        if (date === undefined || time === undefined || timeZone === undefined) {
          throw new Error('Date, time, and timezone are required.');
        }
        const session = await gameplay.scheduleClass(
          interaction.id,
          discordUserId,
          interaction.guildID,
          {
            date,
            time,
            timeZone,
          },
        );
        const timestamp = Math.floor(session.scheduledAt.getTime() / 1_000);
        await completeCommand(interaction, {
          embeds: [
            createNoeliaEmbed({
              title: 'Academy class scheduled',
              description: `**${session.stageName} · Regular Ballet Class**\n<t:${timestamp}:F> · ${session.timeZone}\nCheck-in opens <t:${Math.floor(session.checkInOpensAt.getTime() / 1_000)}:R> and closes <t:${Math.floor(session.checkInClosesAt.getTime() / 1_000)}:R>. Cancel before <t:${Math.floor(session.cancellationDeadlineAt.getTime() / 1_000)}:F>.\n\nClass ID: \`${session.scheduledClassId}\`${session.replayed ? '\nThis is your saved booking.' : ''}`,
              tone: 'success',
            }),
          ],
        });
        return;
      }

      if (selected.name === 'cancel' || selected.name === 'checkin') {
        const classId = readOption(selected, 'class_id');
        if (classId === undefined) throw new Error('A scheduled class ID is required.');
        const result =
          selected.name === 'cancel'
            ? await gameplay.cancelClass(interaction.id, discordUserId, classId)
            : await gameplay.checkIn(interaction.id, discordUserId, classId);
        const attendedInstruction =
          selected.name === 'checkin'
            ? '\nNow start or resume your guided session with /ballet class to receive its saved report grade.'
            : '';
        await completeCommand(interaction, {
          embeds: [
            createNoeliaEmbed({
              title:
                selected.name === 'cancel'
                  ? 'Class cancelled with notice'
                  : 'Academy attendance recorded',
              description: `${result.stageName} · <t:${Math.floor(result.scheduledAt.getTime() / 1_000)}:F>\nStatus: ${result.status.replaceAll('_', ' ')}.${attendedInstruction}${result.replayed ? '\nThis is the saved result for your interaction.' : ''}`,
              tone: 'success',
            }),
          ],
        });
        return;
      }

      if (selected.name === 'report') {
        const report = await gameplay.getReportBook(discordUserId);
        const history = report.entries.map((entry) => {
          const timestamp = Math.floor(entry.scheduledAt.getTime() / 1_000);
          const grade =
            entry.grades === null
              ? ''
              : ` · overall ${entry.grades.overall}/6 (rhythm ${entry.grades.rhythm ?? '—'}, technique ${entry.grades.technique ?? '—'}, coordination ${entry.grades.coordination ?? '—'}, preparation ${entry.grades.preparation ?? '—'}, participation ${entry.grades.participation})`;
          return `• <t:${timestamp}:d> · ${entry.status.replaceAll('_', ' ')}${grade}\n  ID: \`${entry.scheduledClassId}\``;
        });
        const attendanceTone = resolveMadameAttendanceToneFromHistory(
          report.recentAttendanceStatuses,
        );
        const discipline = {
          APPROVING: 'Madame is pleased with your steady attendance.',
          NEUTRAL: 'Madame is keeping a close eye on your attendance as you settle in.',
          FIRM: 'Madame expects you to communicate before your next absence.',
          STRICT:
            'Madame is being firm after repeated missed classes. This affects participation records only, never Ballet skills or Discord moderation.',
        }[attendanceTone];
        await completeCommand(interaction, {
          embeds: [
            createNoeliaEmbed({
              title: 'Maison Noélia · Academy Report Book',
              description: [
                `**Stage:** ${report.stageName} · **Enrolled:** ${report.enrolled ? 'yes' : 'no'}`,
                `**Academy comfort:** ${report.academyComfort}/100 · fictional game progress only`,
                `**Beginner foundations:** ${report.completedActions.filter((code) => getAvailableBeginnerActions(report.stageId).some((action) => action.code === code)).length}/${getAvailableBeginnerActions(report.stageId).length}`,
                `**Attendance:** ${report.attendedCount} attended · ${report.excusedCount} excused · ${report.missedCount} missed · ${report.systemCancelledCount} system-cancelled`,
                discipline,
                '',
                '**Recent classes**',
                history.length === 0 ? 'No scheduled classes yet.' : history.join('\n'),
                '',
                'Grades are deterministic summaries of saved class evidence. A missed class changes participation only; it never removes technical progress.',
              ].join('\n'),
            }),
          ],
        });
        return;
      }
      throw new Error('Unsupported Academy subcommand.');
    }

    const assessment = services.academyAssessment;
    if (assessment === undefined)
      throw new Error('The Academy assessment service is not configured.');
    const overview = await assessment.getOverview(discordUserId);
    const personaEmbed = createPersonaEmbedRenderer(services.persona, 'ballet', discordUserId);
    const embed = await renderAcademyAssessment(overview, personaEmbed);
    await completeCommand(interaction, {
      embeds: [embed],
      components: createAcademyAssessmentComponents(overview),
    });
  },
};

interface SelectedSubcommand {
  readonly name: string;
  readonly type: number;
  readonly options?: readonly { readonly name: string; readonly value?: unknown }[];
}

function readOption(selected: SelectedSubcommand, name: string): string | undefined {
  const option = selected.options?.find((entry) => entry.name === name);
  return option !== undefined && typeof option.value === 'string' ? option.value : undefined;
}

export async function renderAcademyAssessment(
  overview: AcademyAssessmentOverview,
  personaEmbed: ReturnType<typeof createPersonaEmbedRenderer>,
): Promise<Eris.EmbedOptions> {
  const attempt = overview.activeAttempt;
  const question = attempt?.currentQuestion ?? null;
  const resultAttempt = attempt === null ? overview.latestAttempt : null;
  const title =
    attempt !== null
      ? `Academy assessment · ${attempt.targetStageName}`
      : overview.targetStageName === null
        ? `Academy · ${overview.currentStageName}`
        : `Academy assessment · ${overview.targetStageName}`;

  const lines = [
    `**Current stage:** ${overview.currentStageName}`,
    `**Next stage:** ${overview.targetStageName ?? 'Solo Seal completed'}`,
  ];

  if (question !== null && attempt !== null) {
    lines.push(
      '',
      `**Knowledge · ${question.domainName} · ${question.title}**`,
      question.question,
      `Question ${attempt.currentQuestionIndex + 1} of ${attempt.totalQuestions}`,
      'Your Practical evidence is the saved review from a completed class at your current stage.',
    );
  } else {
    lines.push('');
    if (overview.targetStageId === null) {
      lines.push('The canonical Academy journey ends at Solo Seal. No further stage is available.');
    } else {
      lines.push(
        overview.eligibility.eligible
          ? 'You are eligible to begin the next assessment.'
          : 'Complete the requirements below before starting.',
      );
      for (const requirement of overview.eligibility.requirements) {
        lines.push(`${requirement.met ? '✓' : '○'} ${requirement.label}`);
      }
    }
  }

  if (resultAttempt?.result !== null && resultAttempt?.result !== undefined) {
    const result = resultAttempt.result;
    const replacedEntryAssessment =
      resultAttempt.sourceStageId === 'minis-bambinis' &&
      resultAttempt.targetStageId === 'pre-primary' &&
      result.status === 'RETAKE_REQUIRED' &&
      overview.currentStageId === 'pre-school-dance';
    lines.push(
      '',
      replacedEntryAssessment
        ? '**Previous curriculum assessment:** Saved without promotion after the Academy stage update.'
        : `**Latest result:** ${result.status.replaceAll('_', ' ')} · Knowledge ${result.correctAnswers}/${result.totalQuestions}`,
    );
    const sections = replacedEntryAssessment
      ? []
      : result.practicalSections.map(
          (section) => `${section.displayName}: ${section.rating.replaceAll('_', ' ')}`,
        );
    if (sections.length > 0) lines.push(sections.join(' · '));
    if (result.primaryCorrection !== null && !replacedEntryAssessment) {
      lines.push(
        `Primary correction: ${result.primaryCorrection.category.replaceAll('_', ' ').toLowerCase()}.`,
      );
    }
    lines.push(
      replacedEntryAssessment
        ? 'Preparatory Dance is now the next stage. Your earlier class evidence is still available for eligibility.'
        : result.promoted
          ? 'The result and stage promotion were saved together.'
          : 'Your stage is unchanged. Complete a new current-stage Ballet class before a retake.',
    );
  }

  return personaEmbed(
    attempt !== null
      ? 'assessment_question'
      : resultAttempt?.result?.status === 'RETAKE_REQUIRED'
        ? 'assessment_retake'
        : resultAttempt?.result?.promoted === true
          ? 'assessment_pass'
          : 'assessment_readiness',
    {
      academy_stage: overview.currentStageId,
      assessment_target: attempt?.targetStageId ?? overview.targetStageId ?? 'solo_seal_complete',
      assessment_eligible: overview.eligibility.eligible,
      assessment_in_progress: attempt !== null,
      assessment_status: resultAttempt?.status ?? 'none',
      question_index: attempt?.currentQuestionIndex ?? 0,
    },
    {
      title,
      description: lines.join('\n'),
      tone: resultAttempt?.result?.promoted === true ? 'success' : 'signature',
    },
  );
}
