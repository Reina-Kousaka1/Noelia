import * as Eris from 'eris';

import { formatBalance } from '../balance/format-balance.js';
import type { SlashCommand } from '../command.js';

export const profileCommand: SlashCommand = {
  definition: {
    name: 'profile',
    description: 'See your Ballet progress and current look.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;

    if (discordUserId === undefined) {
      throw new Error('The profile command requires a guild member context.');
    }

    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);
    const profile = await services.profile.getProfile(discordUserId);
    const nextLevel =
      profile.ballet.xpToNextLevel === null
        ? 'Maximum Ballet level reached.'
        : `${formatInteger(profile.ballet.xpToNextLevel)} XP to the next level.`;
    const outfit =
      profile.outfit.length === 0
        ? 'No outfit equipped yet.'
        : profile.outfit
            .map(
              (item) =>
                `• **${item.displayName}** — ${item.slots.map((slot) => slot.replaceAll('_', ' ')).join(', ')}`,
            )
            .join('\n');

    await interaction.createFollowup({
      content: `Noélia · Your studio profile\nBallet Level ${profile.ballet.level} · ${formatInteger(profile.ballet.totalXp)} XP · ${nextLevel}\nBallet Slippers: ${formatBalance(profile.balletSlippers)}\nCurrent look\n${outfit}`,
    });
  },
};

function formatInteger(value: bigint): string {
  return new Intl.NumberFormat('en-US').format(value);
}
