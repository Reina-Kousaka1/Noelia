import * as Eris from 'eris';

import type { SlashCommand } from '../command.js';
import { createNoeliaEmbed } from '../../ui/embed.js';
import { NOELIA_COPY } from '../../persona/copy.js';

export function createHelpCommand(commands: readonly SlashCommand[]): SlashCommand {
  const helpDefinition: SlashCommand['definition'] = {
    name: 'help',
    description: 'See the available Noélia commands.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
  };

  return {
    definition: helpDefinition,
    async execute({ interaction }) {
      const entries = [...commands, { definition: helpDefinition }]
        .map(({ definition }) => `/${definition.name} — ${definition.description}`)
        .join('\n');

      await interaction.createMessage({
        flags: Eris.Constants.MessageFlags.EPHEMERAL,
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.helpTitle,
            description: `${NOELIA_COPY.helpIntro}\n\n${entries}`,
          }),
        ],
      });
    },
  };
}
