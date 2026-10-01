import * as Eris from 'eris';

import type { CommandContext } from '../commands/command.js';
import type { CommandServices } from '../commands/command.js';
import type { CommandRegistry } from '../commands/registry.js';
import type { StructuredLogger } from '../infrastructure/logging/logger.js';
import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class InteractionRouter {
  public constructor(
    private readonly registry: CommandRegistry,
    private readonly logger: StructuredLogger,
    private readonly services: CommandServices,
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

    const context: CommandContext = { client, interaction, services: this.services };

    try {
      await command.execute(context);
    } catch (error) {
      if (error instanceof ExpectedDomainError) {
        this.logger.info('discord.command_rejected', {
          commandName: command.definition.name,
          errorType: error.name,
          interactionId: interaction.id,
        });
        try {
          await this.respond(interaction, error.userMessage, true);
        } catch (responseError) {
          this.logger.error('discord.command_error_response_failed', responseError, {
            commandName: command.definition.name,
            interactionId: interaction.id,
          });
        }
        return;
      }

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
