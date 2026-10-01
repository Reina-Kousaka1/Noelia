import * as Eris from 'eris';
import { completeCommand, deferCommand } from '../../interactions/response-policy.js';

import type { SlashCommand } from '../command.js';
import { formatBalance } from '../balance/format-balance.js';
import { NOELIA_COPY } from '../../persona/copy.js';
import { createPersonaEmbedRenderer } from '../../persona/presentation.js';

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

    const personaEmbed = createPersonaEmbedRenderer(services.persona, 'daily', discordUserId);

    await deferCommand(interaction);
    const claim = await services.daily.claimDaily(interaction.id, discordUserId);
    const status = claim.replayed ? NOELIA_COPY.dailyReplayed : NOELIA_COPY.dailyClaimed;
    const nextClaimTimestamp = Math.floor(claim.nextClaimAt.getTime() / 1_000);

    await completeCommand(interaction, {
      embeds: [
        await personaEmbed(
          claim.replayed ? 'claim_replayed' : 'claim_complete',
          {
            reward: claim.rewardAmount.toString(),
            balance: claim.balance.toString(),
            replayed: claim.replayed,
          },
          {
            title: NOELIA_COPY.dailyTitle,
            description: `${status}\n+${formatBalance(claim.rewardAmount)} · Balance ${formatBalance(claim.balance)}\nNext in <t:${nextClaimTimestamp}:R>.`,
            tone: claim.replayed ? 'signature' : 'success',
          },
        ),
      ],
    });
  },
};
