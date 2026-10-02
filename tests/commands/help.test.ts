import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { createHelpCommand } from '../../src/commands/help/help.command.js';
import type { SlashCommand } from '../../src/commands/command.js';
import { banCommand, warnCommand } from '../../src/commands/moderation/moderation.command.js';
import { pingCommand } from '../../src/commands/ping/ping.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';

describe('help command', () => {
  it('renders the registered command descriptions in a public themed response', async () => {
    const defer = vi.fn().mockResolvedValue(undefined);
    const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      acknowledged: true,
      defer,
      editOriginalMessage,
    } as unknown as Eris.CommandInteraction;
    const balanceCommand: SlashCommand = {
      definition: {
        name: 'balance',
        description: 'See your Ballet Slippers balance.',
        type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
      },
      async execute() {},
    };
    const help = createHelpCommand([pingCommand, balanceCommand, banCommand]);

    await help.execute({
      client: {} as Eris.Client,
      interaction,
      services: {} as never,
    });

    expect(defer).toHaveBeenCalledWith();
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: expect.stringContaining(NOELIA_COPY.helpTitle),
          description: expect.stringContaining('/ping'),
        }),
      ],
    });
    const response = vi.mocked(editOriginalMessage).mock.calls[0]?.[0];
    const embeds = typeof response === 'string' ? undefined : response?.embeds;
    const description = embeds?.[0]?.description;
    expect(description).toContain('/balance');
    expect(description).not.toContain('/ban');
    expect(description).toContain('/help');
  });
  it('shows permission-sensitive moderation help only to members with the permission', async () => {
    const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      acknowledged: true,
      member: {
        id: '111111111111111111',
        guild: { ownerID: '222222222222222222' },
        permissions: new Eris.Permission(Eris.Constants.Permissions.manageMessages),
      },
      defer: vi.fn().mockResolvedValue(undefined),
      editOriginalMessage,
    } as unknown as Eris.CommandInteraction;

    await createHelpCommand([warnCommand, banCommand]).execute({
      client: {} as Eris.Client,
      interaction,
      services: {} as never,
    });

    const response = vi.mocked(editOriginalMessage).mock.calls[0]?.[0];
    const embeds = typeof response === 'string' ? undefined : response?.embeds;
    expect(embeds?.[0]?.description).toContain('/warn');
    expect(embeds?.[0]?.description).not.toContain('/ban');
  });
});
