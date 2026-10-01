import * as Eris from 'eris';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import type { Pool } from 'pg';

import type { AppConfig } from '../../src/config/environment.js';
import { createDiscordRuntime } from '../../src/bot/runtime.js';
import { StructuredLogger } from '../../src/infrastructure/logging/logger.js';

const config: AppConfig = {
  nodeEnvironment: 'test',
  discord: {
    token: 'test-discord-token',
    guildId: '123456789012345678',
  },
  postgres: {
    host: 'localhost',
    port: 5432,
    database: 'noelia',
    user: 'noelia',
    password: 'test-postgres-password',
  },
  persona: {
    generationEnabled: false,
    timeoutMs: 1_100,
    maxConcurrent: 2,
    maxRequestsPerMinute: 20,
  },
};

function createFakeClient() {
  return Object.assign(new EventEmitter(), {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    editStatus: vi.fn(),
    user: { username: 'Noelia' },
    getGuildCommands: vi.fn().mockResolvedValue([]),
    createGuildCommand: vi.fn().mockResolvedValue({}),
    editGuildCommand: vi.fn().mockResolvedValue({}),
    deleteGuildCommand: vi.fn().mockResolvedValue(undefined),
    getCommands: vi.fn().mockResolvedValue([]),
    deleteCommand: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Eris.Client;
}

function createFakePool(): Pool {
  return { query: vi.fn(), connect: vi.fn(), end: vi.fn() } as unknown as Pool;
}

describe('createDiscordRuntime', () => {
  it('starts and stops Eris with reconnect disabled on shutdown', async () => {
    const client = createFakeClient();
    const createClient = vi.fn(() => client);
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});

    const runtime = createDiscordRuntime(config, logger, createFakePool(), createClient);

    await runtime.start();
    await runtime.stop();
    await runtime.stop();

    expect(createClient).toHaveBeenCalledWith('test-discord-token', {
      intents: ['guilds'],
      restMode: true,
      autoreconnect: true,
    });
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(client.disconnect).toHaveBeenCalledWith({ reconnect: false });
  });

  it('disconnects after a failed connection attempt and propagates the failure', async () => {
    const client = createFakeClient();
    vi.mocked(client.connect).mockRejectedValueOnce(new Error('connection failed'));
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});

    const runtime = createDiscordRuntime(config, logger, createFakePool(), () => client);

    await expect(runtime.start()).rejects.toThrow('connection failed');
    expect(client.disconnect).toHaveBeenCalledWith({ reconnect: false });
  });

  it('registers the Noélia guild catalog and clears stale global commands', async () => {
    const client = createFakeClient();
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    const runtime = createDiscordRuntime(config, logger, createFakePool(), () => client);

    client.emit('ready');
    await vi.waitFor(() => {
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'balance' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'daily' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'ballet' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'shop' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'inventory' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'wardrobe' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'profile' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'help' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'market' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'performance' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'marry' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'marriage' }),
      );
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'divorce' }),
      );
      for (const moderationCommand of ['warn', 'warnings', 'modcase', 'timeout', 'kick', 'ban']) {
        expect(client.createGuildCommand).toHaveBeenCalledWith(
          config.discord.guildId,
          expect.objectContaining({ name: moderationCommand }),
        );
      }
    });
    expect(client.editStatus).toHaveBeenCalledWith('online', {
      name: 'At the barre, finding my balance',
      type: Eris.Constants.ActivityTypes.GAME,
    });
    expect(client.getGuildCommands).toHaveBeenCalledWith(config.discord.guildId);
    await vi.waitFor(() => expect(client.getCommands).toHaveBeenCalledOnce());
    await runtime.stop();
  });
});
