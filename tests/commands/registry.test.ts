import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import type { SlashCommand } from '../../src/commands/command.js';
import { pingCommand } from '../../src/commands/ping/ping.command.js';
import { CommandRegistry, synchronizeGuildCommands } from '../../src/commands/registry.js';

describe('CommandRegistry', () => {
  it('rejects duplicate command names', () => {
    expect(() => new CommandRegistry([pingCommand, pingCommand])).toThrow(
      'Duplicate slash command definition: ping',
    );
  });
});

describe('synchronizeGuildCommands', () => {
  it('adds or updates only Noélia commands and preserves the rest of the guild catalog', async () => {
    const unrelatedCommand = { id: 'help-id', name: 'help', type: 1 };
    const api = {
      getGuildCommands: vi.fn().mockResolvedValue([unrelatedCommand]),
      createGuildCommand: vi.fn().mockResolvedValue({}),
      editGuildCommand: vi.fn().mockResolvedValue({}),
    } as unknown as Eris.Client;

    await synchronizeGuildCommands(api, '123456789012345678', new CommandRegistry([pingCommand]));

    expect(api.createGuildCommand).toHaveBeenCalledWith(
      '123456789012345678',
      pingCommand.definition,
    );
    expect(api.editGuildCommand).not.toHaveBeenCalled();
  });

  it('updates an existing matching slash command in place', async () => {
    const api = {
      getGuildCommands: vi.fn().mockResolvedValue([{ id: 'ping-id', name: 'ping', type: 1 }]),
      createGuildCommand: vi.fn().mockResolvedValue({}),
      editGuildCommand: vi.fn().mockResolvedValue({}),
    } as unknown as Eris.Client;

    await synchronizeGuildCommands(api, '123456789012345678', new CommandRegistry([pingCommand]));

    expect(api.editGuildCommand).toHaveBeenCalledWith(
      '123456789012345678',
      'ping-id',
      pingCommand.definition,
    );
    expect(api.createGuildCommand).not.toHaveBeenCalled();
  });

  it('serves as a minimal schema for other command definitions', () => {
    const anotherCommand: SlashCommand = {
      definition: {
        name: 'status',
        description: 'Read Noélia status.',
        type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
      },
      async execute() {},
    };

    expect(new CommandRegistry([anotherCommand]).list()).toEqual([anotherCommand]);
  });
});
