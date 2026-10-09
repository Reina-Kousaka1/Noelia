import * as Eris from 'eris';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  automod: {
    messageScanningEnabled: false,
    joinMonitoringEnabled: false,
  },
};

function createFakeClient() {
  return Object.assign(new EventEmitter(), {
    options: { autoreconnect: true },
    ready: false,
    shards: new Map(),
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
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts and stops Eris with reconnect disabled on shutdown', async () => {
    const client = createFakeClient();
    const createClient = vi.fn(() => client);
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});

    const runtime = createDiscordRuntime(config, logger, createFakePool(), vi.fn(), createClient);

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

    const runtime = createDiscordRuntime(config, logger, createFakePool(), vi.fn(), () => client);

    await expect(runtime.start()).rejects.toThrow('connection failed');
    expect(client.disconnect).toHaveBeenCalledWith({ reconnect: false });
  });

  it('keeps one presence timer through reconnects and clears it on shutdown', async () => {
    vi.useFakeTimers();
    const client = createFakeClient();
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const runtime = createDiscordRuntime(config, logger, createFakePool(), vi.fn(), () => client);

    await runtime.start();
    client.emit('ready');
    client.emit('disconnect');
    client.emit('ready');

    expect(client.editStatus).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(3);
    vi.advanceTimersByTime(120_000);
    expect(client.editStatus).toHaveBeenCalledTimes(2);

    await runtime.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves Eris recovery and cancels the watchdog during shutdown', async () => {
    vi.useFakeTimers();
    const client = createFakeClient();
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const recover = vi.fn();
    const runtime = createDiscordRuntime(config, logger, createFakePool(), recover, () => client);
    await runtime.start();
    expect(client.options.autoreconnect).toBe(true);
    client.emit('shardDisconnect', new Error('network unavailable'), 0);
    vi.advanceTimersByTime(60_000);
    expect(recover).not.toHaveBeenCalled();
    await runtime.stop();
    client.emit('shardResume', 0);
    client.emit('ready');
    vi.advanceTimersByTime(30 * 60_000);
    expect(recover).not.toHaveBeenCalled();
    expect(client.options.autoreconnect).toBe(false);
    expect(client.editStatus).not.toHaveBeenCalled();
  });

  it('requests one recovery after prolonged gateway startup failure', async () => {
    vi.useFakeTimers();
    const client = createFakeClient();
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const recover = vi.fn();
    const runtime = createDiscordRuntime(config, logger, createFakePool(), recover, () => client);
    await runtime.start();
    vi.advanceTimersByTime(15 * 60_000);
    expect(recover).toHaveBeenCalledOnce();
    client.emit('disconnect');
    vi.advanceTimersByTime(30 * 60_000);
    expect(recover).toHaveBeenCalledOnce();
    await runtime.stop();
  });

  it('requests privileged AutoMod intents only when their runtime switches are enabled', async () => {
    const client = createFakeClient();
    const createClient = vi.fn(() => client);
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    const runtime = createDiscordRuntime(
      {
        ...config,
        automod: { messageScanningEnabled: true, joinMonitoringEnabled: true },
      },
      logger,
      createFakePool(),
      vi.fn(),
      createClient,
    );

    expect(createClient).toHaveBeenCalledWith('test-discord-token', {
      intents: ['guilds', 'guildMessages', 'messageContent', 'guildMembers'],
      restMode: true,
      autoreconnect: true,
    });
    expect(client.listenerCount('messageCreate')).toBe(1);
    expect(client.listenerCount('guildMemberAdd')).toBe(1);
    await runtime.stop();
  });

  it('registers the Noélia guild catalog and clears stale global commands', async () => {
    const client = createFakeClient();
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    const runtime = createDiscordRuntime(config, logger, createFakePool(), vi.fn(), () => client);

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
      expect(client.createGuildCommand).toHaveBeenCalledWith(
        config.discord.guildId,
        expect.objectContaining({ name: 'automod' }),
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
