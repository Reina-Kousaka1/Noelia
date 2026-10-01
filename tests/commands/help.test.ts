import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { createHelpCommand } from '../../src/commands/help/help.command.js';
import type { SlashCommand } from '../../src/commands/command.js';
import { pingCommand } from '../../src/commands/ping/ping.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';

describe('help command', () => {
  it('renders the registered command descriptions in a private themed response', async () => {
    const interaction = {
      createMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as Eris.CommandInteraction;
    const balanceCommand: SlashCommand = {
      definition: {
        name: 'balance',
        description: 'See your Ballet Slippers balance.',
        type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
      },
      async execute() {},
    };
    const help = createHelpCommand([pingCommand, balanceCommand]);

    await help.execute({
      client: {} as Eris.Client,
      interaction,
      services: {} as never,
    });

    expect(interaction.createMessage).toHaveBeenCalledWith({
      flags: Eris.Constants.MessageFlags.EPHEMERAL,
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.helpTitle,
          description: expect.stringContaining('/ping'),
        }),
      ],
    });
    const response = vi.mocked(interaction.createMessage).mock.calls[0]?.[0];
    const embeds = typeof response === 'string' ? undefined : response?.embeds;
    const description = embeds?.[0]?.description;
    expect(description).toContain('/balance — See your Ballet Slippers balance.');
    expect(description).toContain('/help — See the available Noélia commands.');
  });
});
