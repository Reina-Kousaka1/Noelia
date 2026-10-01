import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import type { SlashCommand } from '../../src/commands/command.js';
import { CommandRegistry } from '../../src/commands/registry.js';
import { InteractionRouter } from '../../src/interactions/interaction-router.js';
import { StructuredLogger } from '../../src/infrastructure/logging/logger.js';

function createInteraction(name: string, acknowledged = false): Eris.CommandInteraction {
  return {
    id: 'interaction-id',
    data: { name },
    acknowledged,
    createMessage: vi.fn().mockResolvedValue(undefined),
    createFollowup: vi.fn().mockResolvedValue(undefined),
  } as unknown as Eris.CommandInteraction;
}

function createCommand(execute: SlashCommand['execute']): SlashCommand {
  return {
    definition: {
      name: 'ping',
      description: 'Check whether Noélia is responding.',
      type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    },
    execute,
  };
}

describe('InteractionRouter', () => {
  it('routes a command interaction to its registered handler', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const command = createCommand(execute);
    const interaction = createInteraction('ping');
    const client = {} as Eris.Client;
    const router = new InteractionRouter(new CommandRegistry([command]), new StructuredLogger());

    await router.dispatch(interaction, client);

    expect(execute).toHaveBeenCalledWith({ client, interaction });
    expect(interaction.createMessage).not.toHaveBeenCalled();
  });

  it('returns a generic ephemeral response when a handler fails', async () => {
    const command = createCommand(vi.fn().mockRejectedValue(new Error('internal failure')));
    const interaction = createInteraction('ping');
    const client = {} as Eris.Client;
    const logger = new StructuredLogger();
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const router = new InteractionRouter(new CommandRegistry([command]), logger);

    await router.dispatch(interaction, client);

    expect(interaction.createMessage).toHaveBeenCalledWith({
      content: 'Noélia could not complete that command. Please try again in a moment.',
      flags: Eris.Constants.MessageFlags.EPHEMERAL,
    });
    expect(logError).toHaveBeenCalledWith('discord.command_failed', expect.any(Error), {
      commandName: 'ping',
      interactionId: 'interaction-id',
    });
  });

  it('does not execute or expose details for an unknown command', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const command = createCommand(execute);
    const interaction = createInteraction('unknown');
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const router = new InteractionRouter(new CommandRegistry([command]), logger);

    await router.dispatch(interaction, {} as Eris.Client);

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.createMessage).toHaveBeenCalledWith({
      content: 'That command is not available.',
      flags: Eris.Constants.MessageFlags.EPHEMERAL,
    });
  });
});
