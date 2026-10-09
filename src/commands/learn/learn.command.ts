import * as Eris from 'eris';

import { completeCommand, deferCommand } from '../../interactions/response-policy.js';
import {
  getKnowledgeLesson,
  isKnowledgeDomain,
  KNOWLEDGE_DOMAINS,
  KNOWLEDGE_LESSONS,
} from '../../knowledge/catalog.js';
import { createNoeliaEmbed } from '../../ui/embed.js';
import type { SlashCommand } from '../command.js';

const subcommand = Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND;
const stringOption = Eris.Constants.ApplicationCommandOptionTypes.STRING;
const domainChoices = KNOWLEDGE_DOMAINS.map((domain) => ({
  name: KNOWLEDGE_LESSONS.find((lesson) => lesson.domain === domain)?.domainName ?? domain,
  value: domain,
}));
const lessonChoices = KNOWLEDGE_LESSONS.map((lesson) => ({
  name: `${lesson.domainName} · ${lesson.title}`,
  value: lesson.id,
}));

export const learnCommand: SlashCommand = {
  definition: {
    name: 'learn',
    description: 'Study ballet and Academy knowledge at your own pace.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'browse',
        description: 'Browse Academy lessons, optionally by subject.',
        type: subcommand,
        options: [
          {
            name: 'domain',
            description: 'Choose a subject area.',
            type: stringOption,
            required: false,
            choices: domainChoices,
          },
        ],
      },
      {
        name: 'progress',
        description: 'Review your Knowledge points and completed lessons.',
        type: subcommand,
      },
      {
        name: 'read',
        description: 'Read a short Academy lesson and its question.',
        type: subcommand,
        options: [
          {
            name: 'lesson',
            description: 'Choose a lesson to read.',
            type: stringOption,
            required: true,
            choices: lessonChoices,
          },
        ],
      },
      {
        name: 'answer',
        description: 'Answer a question from an Academy lesson.',
        type: subcommand,
        options: [
          {
            name: 'lesson',
            description: 'Choose the lesson you studied.',
            type: stringOption,
            required: true,
            choices: lessonChoices,
          },
          {
            name: 'answer',
            description: 'Choose A, B, or C from the lesson.',
            type: stringOption,
            required: true,
            choices: [
              { name: 'A', value: 'a' },
              { name: 'B', value: 'b' },
              { name: 'C', value: 'c' },
            ],
          },
        ],
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;
    if (discordUserId === undefined) throw new Error('The learn command requires a guild context.');
    const knowledge = services.knowledge;
    if (knowledge === undefined) throw new Error('The Knowledge service is not configured.');
    const selected = interaction.data.options?.[0];
    if (selected === undefined || selected.type !== subcommand) {
      throw new Error('The learn command requires a subcommand.');
    }
    await deferCommand(interaction);

    if (selected.name === 'browse') {
      const domain = readOption(selected, 'domain');
      if (domain !== undefined && !isKnowledgeDomain(domain)) {
        throw new Error('The selected Academy subject is unavailable.');
      }
      const lessons = await knowledge.listLessons(discordUserId, domain);
      const lines = lessons.map((entry) => {
        const lesson = getKnowledgeLesson(entry.lessonId);
        return `${entry.completed ? '✓' : '○'} **${entry.title}** — ${lesson?.domainName ?? entry.domain}`;
      });
      await completeCommand(interaction, {
        embeds: [
          createNoeliaEmbed({
            title: domain === undefined ? 'Academy Courses' : `Academy · ${domainLabel(domain)}`,
            description:
              lines.length === 0
                ? 'No lessons are available in this subject yet.'
                : `${lines.join('\n')}\n\nUse /learn read to study a lesson, then /learn answer to try its question.`,
          }),
        ],
      });
      return;
    }

    if (selected.name === 'progress') {
      const progress = await knowledge.getProgress(discordUserId);
      await completeCommand(interaction, {
        embeds: [
          createNoeliaEmbed({
            title: 'Your Academy Knowledge',
            description: progress.domains
              .map(
                (domain) =>
                  `**${domain.domainName}**\n${domain.points} Knowledge points · ${domain.completedLessons}/${domain.totalLessons} lessons`,
              )
              .join('\n\n'),
          }),
        ],
      });
      return;
    }

    if (selected.name === 'read') {
      const lessonId = readOption(selected, 'lesson');
      const lesson = lessonId === undefined ? undefined : getKnowledgeLesson(lessonId);
      if (lesson === undefined) throw new Error('The selected Academy lesson is unavailable.');
      const answers = lesson.answers.map(
        (answer) => `**${answer.id.toUpperCase()}.** ${answer.label}`,
      );
      await completeCommand(interaction, {
        embeds: [
          createNoeliaEmbed({
            title: `${lesson.domainName} · ${lesson.title}`,
            description: `${lesson.content}\n\n**Question**\n${lesson.question}\n\n${answers.join('\n')}\n\nWhen ready, submit your choice with /learn answer.`,
          }),
        ],
      });
      return;
    }

    if (selected.name === 'answer') {
      const lessonId = readOption(selected, 'lesson');
      const answerId = readOption(selected, 'answer');
      if (lessonId === undefined || answerId === undefined) {
        throw new Error('The lesson and answer options are required.');
      }
      const lesson = getKnowledgeLesson(lessonId);
      if (lesson === undefined) throw new Error('The selected Academy lesson is unavailable.');
      const result = await knowledge.answer(interaction.id, discordUserId, lessonId, answerId);
      const heading =
        result.outcome === 'CORRECT'
          ? 'Correct.'
          : result.outcome === 'ALREADY_COMPLETED'
            ? 'Lesson already completed'
            : 'Not quite. Read it again.';
      const description =
        result.outcome === 'CORRECT'
          ? `${lesson.explanation}\n\n+${result.pointsAwarded} Knowledge points · ${result.pointsAfter} total in ${lesson.domainName}.${result.replayed ? '\nThis is the saved result for your interaction.' : ''}`
          : result.outcome === 'ALREADY_COMPLETED'
            ? `You already completed this lesson. Your ${result.pointsAfter} ${lesson.domainName} Knowledge points are unchanged.`
            : `Not quite. ${lesson.explanation}\n\nRead the lesson again with /learn read; you can retry without losing progress.`;
      await completeCommand(interaction, {
        embeds: [
          createNoeliaEmbed({
            title: heading,
            description,
            tone:
              result.outcome === 'CORRECT'
                ? 'success'
                : result.outcome === 'INCORRECT'
                  ? 'warning'
                  : 'signature',
          }),
        ],
      });
      return;
    }

    throw new Error('Unsupported learn subcommand.');
  },
};

function readOption(
  selected: {
    readonly options?: readonly { readonly name: string; readonly value?: unknown }[];
  },
  name: string,
): string | undefined {
  const option = selected.options?.find((entry) => entry.name === name);
  return option !== undefined && 'value' in option && typeof option.value === 'string'
    ? option.value
    : undefined;
}

function domainLabel(domain: string): string {
  return KNOWLEDGE_LESSONS.find((lesson) => lesson.domain === domain)?.domainName ?? domain;
}
