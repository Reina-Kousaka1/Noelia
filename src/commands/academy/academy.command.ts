import * as Eris from 'eris';

import type { AcademyAssessmentOverview } from '../../ballet/assessment/types.js';
import { createAcademyAssessmentComponents } from '../../ballet/assessment/components.js';
import { completeCommand, deferCommand } from '../../interactions/response-policy.js';
import { createPersonaEmbedRenderer } from '../../persona/presentation.js';
import type { SlashCommand } from '../command.js';

export const academyCommand: SlashCommand = {
  definition: {
    name: 'academy',
    description: 'Review your Maison Noélia Academy standing and assessments.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
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
    const assessment = services.academyAssessment;
    if (assessment === undefined)
      throw new Error('The Academy assessment service is not configured.');

    // Assessments contain per-user progress and answer controls, so keep the
    // entire component flow private to the invoking user.
    await deferCommand(interaction, 'ephemeral');
    const overview = await assessment.getOverview(discordUserId);
    const personaEmbed = createPersonaEmbedRenderer(services.persona, 'ballet', discordUserId);
    const embed = await renderAcademyAssessment(overview, personaEmbed);
    await completeCommand(interaction, {
      embeds: [embed],
      components: createAcademyAssessmentComponents(overview),
    });
  },
};

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
