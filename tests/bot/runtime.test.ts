import * as Eris from 'eris';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

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
};

function createFakeClient() {
  return Object.assign(new EventEmitter(), {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    getGuildCommands: vi.fn().mockResolvedValue([]),
    createGuildCommand: vi.fn().mockResolvedValue({}),
    editGuildCommand: vi.fn().mockResolvedValue({}),
  }) as unknown as Eris.Client;
}

describe('createDiscordRuntime', () => {
  it('starts and stops Eris with reconnect disabled on shutdown', async () => {
    const client = createFakeClient();
    const createClient = vi.fn(() => client);
    const logger = new StructuredLogger();
    vi.spyOn(logger, 'info').mockImplementation(() => {});

    const runtime = createDiscordRuntime(config, logger, createClient);

    await runtime.start();
    await runtime.stop();
    await runtime.stop();

    expect(createClient).toHaveBeenCalledWith('test-discord-token', {
      intents: ['guilds'],
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

    const runtime = createDiscordRuntime(config, logger, () => client);

    await expect(runtime.start()).rejects.toThrow('connection failed');
    expect(client.disconnect).toHaveBeenCalledWith({ reconnect: false });
  });
});
