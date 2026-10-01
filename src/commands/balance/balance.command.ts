import * as Eris from 'eris';
import { completeCommand, deferCommand } from '../../interactions/response-policy.js';

import type { SlashCommand } from '../command.js';
import { formatBalance } from './format-balance.js';
import { NOELIA_COPY } from '../../persona/copy.js';
import { createPersonaEmbedRenderer } from '../../persona/presentation.js';

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

    const personaEmbed = createPersonaEmbedRenderer(services.persona, 'balance', discordUserId);

    await deferCommand(interaction);
    const balance = await services.economy.getBalance(discordUserId);

    await completeCommand(interaction, {
      embeds: [
        await personaEmbed(
          'balance_view',
          { slippers_balance: balance.toString() },
          {
            title: NOELIA_COPY.balanceTitle,
            description: formatBalance(balance),
          },
        ),
      ],
    });
  },
};
