import * as Eris from 'eris';

import { BALLET_ACTIVITY_CODES } from '../../ballet/activity-codes.js';
import type { SlashCommand } from '../command.js';
import { formatBalance } from '../balance/format-balance.js';

const activityChoices = BALLET_ACTIVITY_CODES.map((code) => ({
  name: code
    .split('-')
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' '),
  value: code,
}));

export const balletCommand: SlashCommand = {
  definition: {
    name: 'ballet',
    description: 'Check your Ballet progress and practice.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'status',
        description: 'See your Ballet level and XP.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'activities',
        description: 'See practice activities and unlocks.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'practice',
        description: 'Complete a Ballet practice activity.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'activity',
            description: 'Choose a practice activity.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
            choices: activityChoices,
          },
        ],
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;

    if (discordUserId === undefined) {
      throw new Error('The ballet command requires a guild member context.');
    }

    const subcommand = interaction.data.options?.[0];

    if (subcommand === undefined) {
      throw new Error('The ballet command requires a subcommand.');
    }

    const subcommandName = subcommand.name;
    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);

    if (subcommandName === 'status') {
      const progress = await services.ballet.getProgress(discordUserId);
      const nextLevelText =
        progress.xpToNextLevel === null
          ? 'Maximum level reached.'
          : `${formatInteger(progress.xpToNextLevel)} XP to the next level.`;
      await interaction.createFollowup({
        content: `Ballet Level ${progress.level} · ${formatInteger(progress.totalXp)} XP · ${nextLevelText}`,
      });
      return;
    }

    if (subcommandName === 'activities') {
      const activities = await services.ballet.listActivities(discordUserId);
      const lines = activities.map((activity) => {
        const state =
          activity.availability === 'LOCKED'
            ? `Unlocks at level ${activity.minimumLevel}`
            : activity.availability === 'COOLDOWN' && activity.nextAvailableAt !== null
              ? `Ready <t:${Math.floor(activity.nextAvailableAt.getTime() / 1_000)}:R>`
              : 'Ready now';
        return `• **${activity.displayName}** — ${formatInteger(activity.xpReward)} XP, ${formatBalance(activity.slippersReward)} · ${state}`;
      });
      await interaction.createFollowup({
        content:
          lines.length === 0 ? 'No Ballet activities are available right now.' : lines.join('\n'),
      });
      return;
    }

    if (subcommandName === 'practice') {
      const subcommandOptions = 'options' in subcommand ? subcommand.options : undefined;
      const activityOption = subcommandOptions?.find(
        (option) => option.name === 'activity' && 'value' in option,
      );
      const activityCode =
        activityOption !== undefined &&
        'value' in activityOption &&
        typeof activityOption.value === 'string'
          ? activityOption.value
          : undefined;

      if (activityCode === undefined) {
        throw new Error('The ballet practice activity option is missing.');
      }

      const result = await services.ballet.practice(interaction.id, discordUserId, activityCode);
      const nextLevelText =
        result.nextLevelXp === null
          ? 'Maximum Ballet level reached.'
          : `${formatInteger(result.nextLevelXp)} XP to the next level.`;
      const heading = result.replayed ? 'Practice already recorded' : 'Practice complete';

      await interaction.createFollowup({
        content: `${heading}: ${result.displayName} earned ${formatInteger(result.xpAwarded)} Ballet XP and ${formatBalance(result.slippersAwarded)}. Level ${result.level} · ${formatInteger(result.totalXp)} XP · ${nextLevelText}`,
      });
      return;
    }

    throw new Error('Unsupported ballet subcommand.');
  },
};

function formatInteger(value: bigint): string {
  return new Intl.NumberFormat('en-US').format(value);
}
