import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import type { SlashCommand } from '../../src/commands/command.js';
import { pingCommand } from '../../src/commands/ping/ping.command.js';
import { shopCommand } from '../../src/commands/shop/shop.command.js';
import { academyCommand } from '../../src/commands/academy/academy.command.js';
import { createRuntimeCommandRegistry } from '../../src/bot/runtime.js';
import {
  CommandRegistry,
  synchronizeApplicationCommands,
  synchronizeGuildCommands,
} from '../../src/commands/registry.js';

const guildId = '123456789012345678';
const existing = (id: string, name: string, description = 'Old description', type = 1) => ({
  id,
  name,
  description,
  type,
  options: [],
});

function fakeClient(guildCommands: object[] = [], globalCommands: object[] = []) {
  const state = { guild: [...guildCommands], global: [...globalCommands] };
  const api = {
    getGuildCommands: vi.fn(async () => [...state.guild]),
    createGuildCommand: vi.fn(async (_guild: string, definition: object) => {
      state.guild.push({ ...definition, id: `created-${state.guild.length}` });
    }),
    editGuildCommand: vi.fn(async (_guild: string, id: string, definition: object) => {
      state.guild = state.guild.map((command) =>
        (command as { id: string }).id === id ? { ...definition, id } : command,
      );
    }),
    deleteGuildCommand: vi.fn(async (_guild: string, id: string) => {
      state.guild = state.guild.filter((command) => (command as { id: string }).id !== id);
    }),
    getCommands: vi.fn(async () => [...state.global]),
    deleteCommand: vi.fn(async (id: string) => {
      state.global = state.global.filter((command) => (command as { id: string }).id !== id);
    }),
  };

  return { api: api as unknown as Eris.Client, state };
}

describe('CommandRegistry', () => {
  it('keeps Academy, V3 Ballet, and all established moderation commands registered', () => {
    const registry = createRuntimeCommandRegistry();
    const names = registry.list().map((command) => command.definition.name);

    expect(names).toContain(academyCommand.definition.name);
    expect(names).toContain('ballet');
    expect(names).toEqual(
      expect.arrayContaining(['warn', 'warnings', 'modcase', 'timeout', 'kick', 'ban', 'automod']),
    );
    expect(names).not.toEqual(
      expect.arrayContaining([
        'levelup',
        'promote-me',
        'give-xp',
        'max-skills',
        'skip-stage',
        'give-all-items',
      ]),
    );
  });

  it('rejects duplicate command names', () => {
    expect(() => new CommandRegistry([pingCommand, pingCommand])).toThrow(
      'Duplicate slash command definition: ping',
    );
  });

  it('serves as the schema for current command definitions', () => {
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

describe('synchronizeGuildCommands', () => {
  it('deletes stale Lindsey commands and creates missing Noélia commands', async () => {
    const { api, state } = fakeClient([
      existing('old-fish', 'fish'),
      existing('old-work', 'work'),
      existing('old-slots', 'slots'),
      existing('old-equip', 'equip'),
    ]);

    await synchronizeGuildCommands(api, guildId, new CommandRegistry([pingCommand]));

    expect(api.deleteGuildCommand).toHaveBeenCalledTimes(4);
    expect(api.createGuildCommand).toHaveBeenCalledWith(guildId, pingCommand.definition);
    expect(state.guild.map((command) => (command as { name: string }).name)).toEqual(['ping']);
  });

  it('updates a changed definition but leaves an identical one untouched', async () => {
    const { api } = fakeClient([existing('ping-id', 'ping')]);
    const registry = new CommandRegistry([pingCommand]);
    const observe = vi.fn();

    await synchronizeGuildCommands(api, guildId, registry, observe);
    await synchronizeGuildCommands(api, guildId, registry, observe);

    expect(api.editGuildCommand).toHaveBeenCalledOnce();
    expect(api.editGuildCommand).toHaveBeenCalledWith(guildId, 'ping-id', pingCommand.definition);
    expect(observe).toHaveBeenCalledWith('updated', 'guild', 'ping');
    expect(observe).toHaveBeenCalledWith('unchanged', 'guild', 'ping');
    expect(api.createGuildCommand).not.toHaveBeenCalled();
  });

  it('replaces stale Lindsey wording inside an existing command option', async () => {
    const outdated = {
      ...shopCommand.definition,
      id: 'shop-id',
      options: [
        { ...shopCommand.definition.options![0]!, description: 'Buy items with credits.' },
        ...shopCommand.definition.options!.slice(1),
      ],
    };
    const { api } = fakeClient([outdated]);

    await synchronizeGuildCommands(api, guildId, new CommandRegistry([shopCommand]));

    expect(api.editGuildCommand).toHaveBeenCalledWith(guildId, 'shop-id', shopCommand.definition);
    expect(api.deleteGuildCommand).not.toHaveBeenCalled();
  });

  it('removes duplicate names and incompatible command types deterministically', async () => {
    const { api, state } = fakeClient([
      existing('b', 'ping', pingCommand.definition.description),
      existing('a', 'ping', pingCommand.definition.description),
      existing('context', 'ping', '', 2),
    ]);

    await synchronizeGuildCommands(api, guildId, new CommandRegistry([pingCommand]));

    expect(api.deleteGuildCommand).toHaveBeenCalledWith(guildId, 'b');
    expect(api.deleteGuildCommand).toHaveBeenCalledWith(guildId, 'context');
    expect(state.guild).toHaveLength(1);
    expect((state.guild[0] as { id: string }).id).toBe('a');
  });
});

describe('synchronizeApplicationCommands', () => {
  it('synchronizes the guild before removing every stale global Lindsey command', async () => {
    const { api, state } = fakeClient(
      [],
      [
        existing('global-fish', 'fish'),
        existing('global-work', 'work'),
        existing('global-slots', 'slots'),
        existing('global-equip', 'equip'),
        existing('global-ping', 'ping', 'Old credits description'),
      ],
    );
    const observe = vi.fn();

    await synchronizeApplicationCommands(api, guildId, new CommandRegistry([pingCommand]), observe);

    expect(api.getCommands).toHaveBeenCalledOnce();
    expect(api.deleteCommand).toHaveBeenCalledTimes(5);
    expect(observe).toHaveBeenCalledWith('deleted', 'global', 'ping');
    expect(state.global).toEqual([]);
    expect(state.guild.map((command) => (command as { name: string }).name)).toEqual(['ping']);
  });

  it('does no writes during an identical second synchronization', async () => {
    const { api } = fakeClient();
    const registry = new CommandRegistry([pingCommand]);

    await synchronizeApplicationCommands(api, guildId, registry);
    await synchronizeApplicationCommands(api, guildId, registry);

    expect(api.createGuildCommand).toHaveBeenCalledOnce();
    expect(api.editGuildCommand).not.toHaveBeenCalled();
    expect(api.deleteGuildCommand).not.toHaveBeenCalled();
    expect(api.deleteCommand).not.toHaveBeenCalled();
  });

  it('does not remove global commands if guild synchronization fails', async () => {
    const { api } = fakeClient([], [existing('global-fish', 'fish')]);
    vi.mocked(api.createGuildCommand).mockRejectedValueOnce(new Error('Discord unavailable'));

    await expect(
      synchronizeApplicationCommands(api, guildId, new CommandRegistry([pingCommand])),
    ).rejects.toThrow('Discord unavailable');

    expect(api.getCommands).not.toHaveBeenCalled();
    expect(api.deleteCommand).not.toHaveBeenCalled();
  });
});
