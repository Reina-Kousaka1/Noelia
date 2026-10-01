import * as Eris from 'eris';

import type { CommandContext } from '../commands/command.js';
import type { CommandRegistry } from '../commands/registry.js';
import type { StructuredLogger } from '../infrastructure/logging/logger.js';

export class InteractionRouter {
  public constructor(
    private readonly registry: CommandRegistry,
    private readonly logger: StructuredLogger,
  ) {}

  public async dispatch(interaction: Eris.CommandInteraction, client: Eris.Client): Promise<void> {
    const command = this.registry.get(interaction.data.name);

    if (command === undefined) {
      this.logger.warn('discord.command_unknown', {
        commandName: interaction.data.name,
        interactionId: interaction.id,
      });
      await this.respond(interaction, 'That command is not available.', true);
      return;
    }

    const context: CommandContext = { client, interaction };

    try {
      await command.execute(context);
    } catch (error) {
      this.logger.error('discord.command_failed', error, {
        commandName: command.definition.name,
        interactionId: interaction.id,
      });

      try {
        await this.respond(
          interaction,
          'Noélia could not complete that command. Please try again in a moment.',
          true,
        );
      } catch (responseError) {
        this.logger.error('discord.command_error_response_failed', responseError, {
          commandName: command.definition.name,
          interactionId: interaction.id,
        });
      }
    }
  }

  private async respond(
    interaction: Eris.CommandInteraction,
    content: string,
    ephemeral: boolean,
  ): Promise<void> {
    const response = ephemeral
      ? { content, flags: Eris.Constants.MessageFlags.EPHEMERAL }
      : { content };

    if (interaction.acknowledged) {
      await interaction.createFollowup(response);
      return;
    }

    await interaction.createMessage(response);
  }
}
