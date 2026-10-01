import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { pingCommand } from '../../src/commands/ping/ping.command.js';

function createCommandInteraction() {
  const createMessage = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: '111111111111111111',
    guildID: '333333333333333333',
    member: { id: '222222222222222222' },
    createMessage,
  } as unknown as Eris.CommandInteraction;
  const client = {
    guildShardMap: { '333333333333333333': 0 },
    shards: new Map([[0, { latency: 41.6 }]]),
  } as unknown as Eris.Client;
  return { interaction, client, createMessage };
}

describe('ping persona', () => {
  it('uses a very short generated greeting and keeps latency factual', async () => {
    const { interaction, client, createMessage } = createCommandInteraction();
    const generate = vi.fn().mockResolvedValue('Bonjour, I am here.');

    await pingCommand.execute({
      client,
      interaction,
      services: { persona: { generate } } as never,
    });

    expect(generate).toHaveBeenCalledWith(
      {
        domain: 'ping',
        action: 'ping_check',
        facts: { gateway_latency_ms: 42 },
      },
      '222222222222222222',
      250,
    );
    expect(createMessage).toHaveBeenCalledWith({
      content: 'Bonjour, I am here. Pong! Noélia is ready. 🩰 Gateway: 42 ms.',
    });
  });

  it('keeps the deterministic ping when persona generation fails', async () => {
    const { interaction, client, createMessage } = createCommandInteraction();

    await pingCommand.execute({
      client,
      interaction,
      services: { persona: { generate: vi.fn().mockRejectedValue(new Error('offline')) } } as never,
    });

    expect(createMessage).toHaveBeenCalledWith({
      content: 'Pong! Noélia is ready. 🩰 Gateway: 42 ms.',
    });
  });

  it('keeps the deterministic ping when a custom persona port hangs or returns unsafe text', async () => {
    const first = createCommandInteraction();
    await pingCommand.execute({
      client: first.client,
      interaction: first.interaction,
      services: { persona: { generate: vi.fn(() => new Promise<string>(() => {})) } } as never,
    });
    expect(first.createMessage).toHaveBeenCalledWith({
      content: 'Pong! Noélia is ready. 🩰 Gateway: 42 ms.',
    });

    const second = createCommandInteraction();
    await pingCommand.execute({
      client: second.client,
      interaction: second.interaction,
      services: { persona: { generate: vi.fn().mockResolvedValue('@everyone hello') } } as never,
    });
    expect(second.createMessage).toHaveBeenCalledWith({
      content: 'Pong! Noélia is ready. 🩰 Gateway: 42 ms.',
    });
  });
});
