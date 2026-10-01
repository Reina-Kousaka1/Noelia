import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { balletCommand } from '../../src/commands/ballet/ballet.command.js';

function createInteraction(options: Eris.InteractionDataOptions[]) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const createFollowup = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: '111111111111111111',
    member: { id: '222222222222222222' },
    data: { options },
    defer,
    createFollowup,
  } as unknown as Eris.CommandInteraction;

  return { interaction, defer, createFollowup };
}

function createServices() {
  return {
    economy: { getBalance: vi.fn() },
    daily: { claimDaily: vi.fn() },
    ballet: {
      getProgress: vi.fn(),
      listActivities: vi.fn(),
      practice: vi.fn(),
    },
    shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
    inventory: { listInventory: vi.fn() },
    wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
  };
}

describe('ballet command', () => {
  it('defines status, activities, and practice as subcommands', () => {
    expect(balletCommand.definition.options?.map((option) => option.name)).toEqual([
      'status',
      'activities',
      'practice',
    ]);
  });

  it('shows XP and level progress privately', async () => {
    const { interaction, defer, createFollowup } = createInteraction([
      { type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND, name: 'status' },
    ]);
    const services = createServices();
    services.ballet.getProgress.mockResolvedValue({
      totalXp: 98n,
      level: 1,
      xpToNextLevel: 2n,
    });

    await balletCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(services.ballet.getProgress).toHaveBeenCalledWith('222222222222222222');
    expect(defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(createFollowup).toHaveBeenCalledWith({
      content: 'Ballet Level 1 · 98 XP · 2 XP to the next level.',
    });
  });

  it('lists activities with their reward and unlock state', async () => {
    const { interaction, createFollowup } = createInteraction([
      { type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND, name: 'activities' },
    ]);
    const services = createServices();
    services.ballet.listActivities.mockResolvedValue([
      {
        code: 'stretching',
        displayName: 'Stretching',
        minimumLevel: 1,
        xpReward: 8n,
        slippersReward: 10n,
        availability: 'AVAILABLE',
        nextAvailableAt: null,
      },
    ]);

    await balletCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(createFollowup).toHaveBeenCalledWith({
      content: '• **Stretching** — 8 XP, 10 🩰 · Ready now',
    });
  });

  it('uses the interaction ID for a practice and renders the reward result', async () => {
    const { interaction, createFollowup } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'practice',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'activity',
            value: 'stretching',
          },
        ],
      },
    ]);
    const services = createServices();
    services.ballet.practice.mockResolvedValue({
      activityCode: 'stretching',
      displayName: 'Stretching',
      xpAwarded: 15n,
      slippersAwarded: 20n,
      totalXp: 105n,
      level: 2,
      nextLevelXp: 95n,
      nextAvailableAt: new Date('2026-10-01T12:30:00.000Z'),
      walletBalance: 220n,
      replayed: false,
    });

    await balletCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(services.ballet.practice).toHaveBeenCalledWith(
      '111111111111111111',
      '222222222222222222',
      'stretching',
    );
    expect(createFollowup).toHaveBeenCalledWith({
      content:
        'Practice complete: Stretching earned 15 Ballet XP and 20 🩰. Level 2 · 105 XP · 95 XP to the next level.',
    });
  });
});
