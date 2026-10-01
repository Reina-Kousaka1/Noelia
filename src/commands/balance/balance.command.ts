import * as Eris from 'eris';

import type { SlashCommand } from '../command.js';
import { formatBalance } from './format-balance.js';

export const balanceCommand: SlashCommand = {
  definition: {
    name: 'balance',
    description: 'Check your Ballet Slippers balance.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;

    if (discordUserId === undefined) {
      throw new Error('The balance command requires a guild member context.');
    }

    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);
    const balance = await services.economy.getBalance(discordUserId);

    await interaction.createFollowup({
      content: `Your Ballet Slippers: ${formatBalance(balance)}`,
    });
  },
};
