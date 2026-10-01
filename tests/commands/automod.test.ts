import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import type { CommandContext } from '../../src/commands/command.js';
import { automodCommand } from '../../src/commands/automod/automod.command.js';
import { DEFAULT_AUTOMOD_RULES } from '../../src/automod/types.js';
import { ModerationAuthorizationError } from '../../src/moderation/authorization.js';

const guildId = '111111111111111111';
const actorId = '222222222222222222';

function makeContext(canManageGuild: boolean) {
  const interaction: Record<string, unknown> = {
    acknowledged: false,
    id: '333333333333333333',
    guildID: guildId,
    member: {
      id: actorId,
      permissions: {
        has: vi.fn((permission: string) => permission === 'manageGuild' && canManageGuild),
      },
    },
    data: {
      options: [
        {
          name: 'status',
          type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        },
      ],
    },
    defer: vi.fn(async () => {
      interaction.acknowledged = true;
    }),
    createMessage: vi.fn(),
    editOriginalMessage: vi.fn(),
  };
  const automod = {
    getConfig: vi.fn().mockResolvedValue({
      guildId,
      rules: DEFAULT_AUTOMOD_RULES,
      allowlistedUserIds: [],
    }),
    setRule: vi.fn(),
    setAllowlisted: vi.fn(),
  };
  const client = {
    guilds: { get: () => ({ ownerID: '444444444444444444' }) },
  };
  const context = {
    client: client as unknown as Eris.Client,
    interaction: interaction as unknown as Eris.CommandInteraction,
    services: {
      automod,
      automodRuntime: { messageScanningEnabled: false, joinMonitoringEnabled: false },
    } as unknown as CommandContext['services'],
  } satisfies CommandContext;

  return { context, interaction, automod };
}

describe('AutoMod command', () => {
  it('is permission-gated and keeps configuration output ephemeral', async () => {
    expect(automodCommand.definition.defaultMemberPermissions).toBe(
      Eris.Constants.Permissions.manageGuild,
    );
    const { context, interaction, automod } = makeContext(true);

    await automodCommand.execute(context);

    expect(automod.getConfig).toHaveBeenCalledWith(guildId);
    expect(interaction.defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(interaction.editOriginalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          'Message scanning listener: disabled by host configuration',
        ),
      }),
    );
  });

  it('rejects members without Manage Server before reading or changing configuration', async () => {
    const { context, interaction, automod } = makeContext(false);

    await expect(automodCommand.execute(context)).rejects.toBeInstanceOf(
      ModerationAuthorizationError,
    );

    expect(automod.getConfig).not.toHaveBeenCalled();
    expect(interaction.defer).not.toHaveBeenCalled();
  });
});
