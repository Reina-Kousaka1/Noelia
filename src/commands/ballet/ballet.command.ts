import * as Eris from 'eris';

import { BALLET_ACTIVITY_CODES } from '../../ballet/activity-codes.js';
import type { SlashCommand } from '../command.js';
import { formatBalance } from '../balance/format-balance.js';
import { NOELIA_COPY } from '../../persona/copy.js';
import { createPersonaEmbedRenderer } from '../../persona/presentation.js';

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

    const personaEmbed = createPersonaEmbedRenderer(services.persona, 'ballet', discordUserId);

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
        embeds: [
          await personaEmbed(
            'status_view',
            {
              level: progress.level,
              total_xp: progress.totalXp.toString(),
              xp_to_next_level: progress.xpToNextLevel?.toString() ?? null,
              technique: progress.stats.technique,
              flexibility: progress.stats.flexibility,
              musicality: progress.stats.musicality,
            },
            {
              title: NOELIA_COPY.balletStatusTitle,
              fields: [
                {
                  name: 'Technique · Flexibility · Musicality',
                  value: `${progress.stats.technique} · ${progress.stats.flexibility} · ${progress.stats.musicality}`,
                  inline: true,
                },
                {
                  name: 'Performance · Pointe · Stamina',
                  value: `${progress.stats.performance} · ${progress.stats.pointe} · ${progress.stats.stamina}`,
                  inline: true,
                },
              ],
              description: `Ballet Level ${progress.level} · ${formatInteger(progress.totalXp)} XP\n${nextLevelText}`,
            },
          ),
        ],
      });
      return;
    }

    if (subcommandName === 'activities') {
      const activities = await services.ballet.listActivities(discordUserId);
      const lines = activities.map((activity) => {
        const state =
          activity.availability === 'LOCKED'
            ? activity.lockReason === 'LEVEL'
              ? `Unlocks at level ${activity.minimumLevel}`
              : activity.requiredEquippedItemId !== null
                ? `Equip ${activity.requiredEquippedItemId}`
                : `Complete ${activity.requiredActivityCode ?? 'its requirement'} first`
            : activity.availability === 'COOLDOWN' && activity.nextAvailableAt !== null
              ? `Ready <t:${Math.floor(activity.nextAvailableAt.getTime() / 1_000)}:R>`
              : 'Ready now';
        return `• **${activity.displayName}** — ${formatInteger(activity.xpReward)} XP, ${formatBalance(activity.slippersReward)} · ${state}`;
      });
      await interaction.createFollowup({
        embeds: [
          await personaEmbed(
            'activities_view',
            {
              activity_count: activities.length,
              ready_count: activities.filter((activity) => activity.availability === 'AVAILABLE')
                .length,
              locked_count: activities.filter((activity) => activity.availability === 'LOCKED')
                .length,
            },
            {
              title: NOELIA_COPY.balletActivitiesTitle,
              fields: activities.map((activity) => ({
                name: `${activity.displayName} · ${activity.statKey} +${activity.statGain}`,
                value: `${activity.description}${activity.requiredEquippedItemId === null ? '' : ` · Equip ${activity.requiredEquippedItemId}`}${activity.requiredActivityCode === null ? '' : ` · Complete ${activity.requiredActivityCode}`}`,
                inline: false,
              })),
              description:
                lines.length === 0
                  ? 'No Ballet activities are available right now.'
                  : lines.join('\n'),
            },
          ),
        ],
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
      const heading = result.replayed
        ? NOELIA_COPY.balletPracticeReplayed
        : NOELIA_COPY.balletPracticeComplete;

      await interaction.createFollowup({
        embeds: [
          await personaEmbed(
            result.replayed ? 'practice_replayed' : 'practice_complete',
            {
              activity: result.activityCode.replaceAll('-', '_'),
              xp_gained: result.xpAwarded.toString(),
              slippers_gained: result.slippersAwarded.toString(),
              stat: result.stat?.key ?? null,
              stat_gain: result.stat?.gain ?? 0,
              level: result.level,
              xp_to_next_level: result.nextLevelXp?.toString() ?? null,
              replayed: result.replayed,
            },
            {
              title: heading,
              fields:
                result.stat === null
                  ? []
                  : [
                      {
                        name: `${result.stat.key} · +${result.stat.gain}`,
                        value: `${result.stat.value}/100`,
                        inline: true,
                      },
                    ],
              description: `${result.displayName} · +${formatInteger(result.xpAwarded)} Ballet XP · +${formatBalance(result.slippersAwarded)}\nLevel ${result.level} · ${formatInteger(result.totalXp)} XP · ${nextLevelText}`,
              tone: result.replayed ? 'signature' : 'success',
            },
          ),
        ],
      });
      return;
    }

    throw new Error('Unsupported ballet subcommand.');
  },
};

function formatInteger(value: bigint): string {
  return new Intl.NumberFormat('en-US').format(value);
}
