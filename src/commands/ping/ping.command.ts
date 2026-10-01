import * as Eris from 'eris';

import type { SlashCommand } from '../command.js';
import { buildPingResponse } from './response.js';

export const pingCommand: SlashCommand = {
  definition: {
    name: 'ping',
    description: 'Check whether Noélia is responding.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
  },
  async execute({ client, interaction }) {
    const shardId = interaction.guildID ? client.guildShardMap[interaction.guildID] : undefined;
    const gatewayLatency = shardId === undefined ? undefined : client.shards.get(shardId)?.latency;

    await interaction.createMessage({
      content: buildPingResponse(gatewayLatency),
    });
  },
};
