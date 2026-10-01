import * as Eris from 'eris';
import { completeCommand, deferCommand } from '../../interactions/response-policy.js';

import type { SlashCommand } from '../command.js';
import { NOELIA_COPY } from '../../persona/copy.js';
import { createPersonaEmbedRenderer } from '../../persona/presentation.js';

export function createHelpCommand(commands: readonly SlashCommand[]): SlashCommand {
  const helpDefinition: SlashCommand['definition'] = {
    name: 'help',
    description: 'See the available Noélia commands.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
  };

  return {
    definition: helpDefinition,
    async execute({ interaction, services }) {
      await deferCommand(interaction);
      const entries = [...commands, { definition: helpDefinition }]
        .map(({ definition }) => `/${definition.name} — ${definition.description}`)
        .join('\n');
      const personaEmbed = createPersonaEmbedRenderer(
        services.persona,
        'help',
        interaction.member?.id,
      );

      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            'guide_view',
            { command_count: commands.length },
            {
              title: NOELIA_COPY.helpTitle,
              description: `${NOELIA_COPY.helpIntro}\n\n${entries}`,
            },
          ),
        ],
      });
    },
  };
}
