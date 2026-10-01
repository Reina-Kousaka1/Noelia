import * as Eris from 'eris';

import { formatBalance } from '../balance/format-balance.js';
import type { SlashCommand } from '../command.js';
import { NOELIA_COPY } from '../../persona/copy.js';
import { BALLET_PERFORMANCE_IDS } from '../../performance/catalog.js';
import { createNoeliaEmbed } from '../../ui/embed.js';

const subcommandOption = Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND;
const integerOption = Eris.Constants.ApplicationCommandOptionTypes.INTEGER;
const stringOption = Eris.Constants.ApplicationCommandOptionTypes.STRING;

const performanceChoices = BALLET_PERFORMANCE_IDS.map((id) => ({
  name: id
    .split('-')
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' '),
  value: id,
}));

export const performanceCommand: SlashCommand = {
  definition: {
    name: 'performance',
    description: 'Prepare a Ballet performance and review your stage history.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'browse',
        description: 'See available Ballet performances and requirements.',
        type: subcommandOption,
      },
      {
        name: 'attempt',
        description: 'Complete an eligible Ballet performance.',
        type: subcommandOption,
        options: [
          {
            name: 'performance',
            description: 'Choose a performance.',
            type: stringOption,
            required: true,
            choices: performanceChoices,
          },
        ],
      },
      {
        name: 'history',
        description: 'Review your completed performances.',
        type: subcommandOption,
        options: [
          {
            name: 'page',
            description: 'Page number (defaults to 1).',
            type: integerOption,
            required: false,
          },
        ],
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;
    if (discordUserId === undefined) {
      throw new Error('The performance command requires a guild member context.');
    }
    const performances = services.performances;
    if (performances === undefined) {
      throw new Error('The performance service is not configured.');
    }
    const subcommand = interaction.data.options?.[0];
    if (subcommand === undefined) {
      throw new Error('The performance command requires a subcommand.');
    }

    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);

    if (subcommand.name === 'browse') {
      const rows = await performances.listPerformances(discordUserId);
      const lines = rows.map((performance) => {
        const status =
          performance.availability === 'LOCKED'
            ? `Locked: ${performance.lockReason?.toLowerCase() ?? 'requirements'}`
            : performance.availability === 'COOLDOWN' && performance.nextAvailableAt !== null
              ? `Ready <t:${Math.floor(performance.nextAvailableAt.getTime() / 1_000)}:R>`
              : 'Ready now';
        const requirements = performance.requirements
          .map((requirement) => `${requirement.key} ${requirement.minimum}+`)
          .join(', ');
        const extras = [
          performance.requiredEquippedItemId === null
            ? null
            : `equip ${performance.requiredEquippedItemId}`,
          performance.requiredActivityCode === null
            ? null
            : `complete ${performance.requiredActivityCode}`,
        ].filter((value) => value !== null);
        const requirementText = [requirements, ...extras].filter(Boolean).join('; ');
        return `**${performance.displayName}** — ${status}\n${performance.description}\nLevel ${performance.minimumLevel} · ${formatInteger(performance.xpReward)} XP · ${formatBalance(performance.slippersReward)}${requirementText.length === 0 ? '' : `\n${requirementText}`}`;
      });
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.performanceBrowseTitle,
            description: rows.length === 0 ? NOELIA_COPY.performanceEmpty : lines.join('\n\n'),
          }),
        ],
      });
      return;
    }

    if (subcommand.name === 'attempt') {
      const options = 'options' in subcommand ? subcommand.options : undefined;
      const performanceOption = options?.find(
        (option) => option.name === 'performance' && 'value' in option,
      );
      const performanceId =
        performanceOption !== undefined &&
        'value' in performanceOption &&
        typeof performanceOption.value === 'string'
          ? performanceOption.value
          : undefined;
      if (performanceId === undefined) {
        throw new Error('The performance choice is missing.');
      }

      const result = await performances.perform(interaction.id, discordUserId, performanceId);
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: result.replayed
              ? NOELIA_COPY.performanceHistoryTitle
              : NOELIA_COPY.performanceTitle,
            description: `**${result.displayName} · ${result.tier}**\nScore ${result.score}/100 · +${formatInteger(result.xpAwarded)} Ballet XP · +${formatBalance(result.slippersAwarded)}\nLevel ${result.level} · ready again <t:${Math.floor(result.nextAvailableAt.getTime() / 1_000)}:R>`,
            tone: result.replayed ? 'signature' : 'success',
          }),
        ],
      });
      return;
    }

    if (subcommand.name === 'history') {
      const options = 'options' in subcommand ? subcommand.options : undefined;
      const pageOption = options?.find((option) => option.name === 'page' && 'value' in option);
      const page =
        pageOption !== undefined && 'value' in pageOption && typeof pageOption.value === 'number'
          ? pageOption.value
          : 1;
      const history = await performances.listHistory(discordUserId, page);
      const lines = history.entries.map(
        (entry) =>
          `**${entry.displayName} · ${entry.tier} (${entry.score}/100)** — <t:${Math.floor(entry.completedAt.getTime() / 1_000)}:d>\n${formatInteger(entry.xpAwarded)} XP · ${formatBalance(entry.slippersAwarded)}`,
      );
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.performanceHistoryTitle,
            description:
              lines.length === 0
                ? NOELIA_COPY.performanceHistoryEmpty
                : `Page ${history.page}/${history.totalPages}\n${lines.join('\n\n')}`,
          }),
        ],
      });
      return;
    }

    throw new Error('Unsupported performance subcommand.');
  },
};

function formatInteger(value: bigint): string {
  return new Intl.NumberFormat('en-US').format(value);
}
