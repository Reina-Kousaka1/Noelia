import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { performanceCommand } from '../../src/commands/performance/performance.command.js';

const userId = '222222222222222222';
const interactionId = '111111111111111111';

function createInteraction(
  subcommand: string,
  options: readonly { name: string; value: unknown }[] = [],
) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: interactionId,
    member: { id: userId },
    data: { options: [{ name: subcommand, options }] },
    acknowledged: true,

    defer,
    editOriginalMessage,
  } as unknown as Eris.CommandInteraction;
  return { interaction, defer, editOriginalMessage };
}

describe('performance command', () => {
  it('browses the database-backed performance catalog publicly', async () => {
    const { interaction, defer, editOriginalMessage } = createInteraction('browse');
    const performances = {
      listPerformances: vi.fn().mockResolvedValue([
        {
          performanceId: 'spring-recital',
          displayName: 'Spring Recital',
          description: 'A calm recital variation.',
          minimumLevel: 10,
          xpReward: 100n,
          slippersReward: 100n,
          requirements: [{ key: 'technique', minimum: 15, weight: 30 }],
          requiredEquippedItemId: null,
          requiredActivityCode: 'performance',
          availability: 'AVAILABLE',
          lockReason: null,
          nextAvailableAt: null,
        },
      ]),
      perform: vi.fn(),
      listHistory: vi.fn(),
    };

    await performanceCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { performances } as never,
    });

    expect(performances.listPerformances).toHaveBeenCalledWith(userId);
    expect(defer).toHaveBeenCalledWith();
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [expect.objectContaining({ description: expect.stringContaining('Spring Recital') })],
    });
  });

  it('uses the Discord interaction ID for an attempt and renders deterministic results', async () => {
    const { interaction, editOriginalMessage } = createInteraction('attempt', [
      { name: 'performance', value: 'spring-recital' },
    ]);
    const performances = {
      listPerformances: vi.fn(),
      perform: vi.fn().mockResolvedValue({
        performanceId: 'spring-recital',
        displayName: 'Spring Recital',
        score: 72,
        tier: 'SILVER',
        xpAwarded: 100n,
        slippersAwarded: 100n,
        totalXp: 1_000n,
        level: 11,
        walletBalance: 300n,
        completedAt: new Date('2026-10-01T12:00:00.000Z'),
        nextAvailableAt: new Date('2026-10-08T12:00:00.000Z'),
        replayed: false,
      }),
      listHistory: vi.fn(),
    };

    await performanceCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { performances } as never,
    });

    expect(performances.perform).toHaveBeenCalledWith(interactionId, userId, 'spring-recital');
    expect(editOriginalMessage).toHaveBeenCalledOnce();
  });

  it('renders a paged performance history', async () => {
    const { interaction, editOriginalMessage } = createInteraction('history', [
      { name: 'page', value: 2 },
    ]);
    const performances = {
      listPerformances: vi.fn(),
      perform: vi.fn(),
      listHistory: vi.fn().mockResolvedValue({
        entries: [],
        page: 2,
        pageSize: 10,
        totalEntries: 11,
        totalPages: 2,
      }),
    };

    await performanceCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { performances } as never,
    });

    expect(performances.listHistory).toHaveBeenCalledWith(userId, 2);
    expect(editOriginalMessage).toHaveBeenCalledOnce();
  });
});
