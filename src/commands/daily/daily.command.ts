import * as Eris from 'eris';

import type { SlashCommand } from '../command.js';
import { formatBalance } from '../balance/format-balance.js';

export const dailyCommand: SlashCommand = {
  definition: {
    name: 'daily',
    description: 'Claim your daily Ballet Slippers reward.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;

    if (discordUserId === undefined) {
      throw new Error('The daily command requires a guild member context.');
    }

    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);
    const claim = await services.daily.claimDaily(interaction.id, discordUserId);
    const status = claim.replayed ? 'Daily already claimed' : 'Daily claimed';
    const nextClaimTimestamp = Math.floor(claim.nextClaimAt.getTime() / 1_000);

    await interaction.createFollowup({
      content: `${status}: +${formatBalance(claim.rewardAmount)}. Balance: ${formatBalance(claim.balance)}. Next in <t:${nextClaimTimestamp}:R>.`,
    });
  },
};
