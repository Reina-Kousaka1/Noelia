import * as Eris from 'eris';

import type { SlashCommand } from '../command.js';
import { createNoeliaEmbed } from '../../ui/embed.js';
import { NOELIA_COPY } from '../../persona/copy.js';

export const achievementsCommand: SlashCommand = {
  definition: {
    name: 'achievements',
    description: 'See your Ballet milestones and choose a profile badge.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'list',
        description: 'See milestones you have and have not unlocked.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'feature',
        description: 'Show an unlocked milestone on your profile.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'achievement_id',
            description: 'Stable achievement ID shown by /achievements list.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
          },
        ],
      },
      {
        name: 'clear_featured',
        description: 'Remove your featured milestone from your profile.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;
    if (discordUserId === undefined) {
      throw new Error('The achievements command requires a guild member context.');
    }
    const achievementService = services.achievements;
    if (achievementService === undefined) {
      throw new Error('The achievement service is not configured.');
    }
    const subcommand = interaction.data.options?.[0];
    if (subcommand === undefined)
      throw new Error('The achievements command requires a subcommand.');
    if (subcommand.type !== Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND) {
      throw new Error('The achievements command requires a subcommand.');
    }
    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);

    if (subcommand.name === 'list') {
      const achievements = await achievementService.list(discordUserId);
      const lines = achievements.map((achievement) =>
        NOELIA_COPY.achievementListEntry(
          achievement.badgeMark,
          achievement.displayName,
          achievement.achievementId,
          achievement.unlockedAt !== null,
          achievement.featured,
        ),
      );
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.achievementsTitle,
            description:
              lines.length === 0
                ? NOELIA_COPY.achievementsEmpty
                : `${NOELIA_COPY.achievementsIntro}\n\n${lines.join('\n\n')}`,
          }),
        ],
      });
      return;
    }

    if (subcommand.name === 'feature') {
      const option = subcommand.options?.find((candidate) => candidate.name === 'achievement_id');
      const achievementId =
        option !== undefined && 'value' in option && typeof option.value === 'string'
          ? option.value
          : undefined;
      if (achievementId === undefined) throw new Error('The achievement ID is missing.');
      const result = await achievementService.feature(interaction.id, discordUserId, achievementId);
      const featured = result.achievement;
      if (featured === null) throw new Error('The featured achievement result is missing.');
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.achievementFeatureTitle,
            description: NOELIA_COPY.achievementFeaturedSummary(
              featured.badgeMark,
              featured.displayName,
            ),
            tone: result.replayed ? 'signature' : 'success',
          }),
        ],
      });
      return;
    }

    if (subcommand.name === 'clear_featured') {
      await achievementService.clearFeatured(interaction.id, discordUserId);
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.achievementFeatureTitle,
            description: NOELIA_COPY.achievementFeatureCleared,
          }),
        ],
      });
      return;
    }

    throw new Error('Unsupported achievements subcommand.');
  },
};
