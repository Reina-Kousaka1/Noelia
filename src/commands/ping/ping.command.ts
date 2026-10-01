import * as Eris from 'eris';

import type { SlashCommand } from '../command.js';
import { buildPingResponse } from './response.js';
import { createPersonaContext, validatePersonaText } from '../../persona/generator.js';

export const pingCommand: SlashCommand = {
  definition: {
    name: 'ping',
    description: 'Check whether Noélia is responding.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
  },
  async execute({ client, interaction, services }) {
    const shardId = interaction.guildID ? client.guildShardMap[interaction.guildID] : undefined;
    const gatewayLatency = shardId === undefined ? undefined : client.shards.get(shardId)?.latency;
    const deterministicResponse = buildPingResponse(gatewayLatency);
    let personaIntro: string | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const generation = services.persona?.generate(
        createPersonaContext('ping', 'ping_check', {
          gateway_latency_ms:
            gatewayLatency !== undefined && Number.isFinite(gatewayLatency)
              ? Math.round(gatewayLatency)
              : null,
        }),
        interaction.member?.id,
        250,
      );
      const deadline = new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), 250);
      });
      personaIntro = validatePersonaText(
        await Promise.race([generation ?? Promise.resolve(undefined), deadline]),
      );
    } catch {
      personaIntro = undefined;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }

    await interaction.createMessage({
      content: `${personaIntro === undefined ? '' : `${personaIntro} `}${deterministicResponse}`,
    });
  },
};
