import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { balletCommand } from '../../src/commands/ballet/ballet.command.js';
import { formatBalance } from '../../src/commands/balance/format-balance.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';
import type { PersonaTextPort } from '../../src/persona/generator.js';

function createInteraction(options: Eris.InteractionDataOptions[]) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: '111111111111111111',
    member: { id: '222222222222222222' },
    data: { options },
    acknowledged: true,

    defer,
    editOriginalMessage,
  } as unknown as Eris.CommandInteraction;

  return { interaction, defer, editOriginalMessage };
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
    profile: { getProfile: vi.fn() },
    persona: { generate: vi.fn().mockResolvedValue(undefined) } as PersonaTextPort,
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

  it('shows XP and level progress publicly', async () => {
    const { interaction, defer, editOriginalMessage } = createInteraction([
      { type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND, name: 'status' },
    ]);
    const services = createServices();
    services.ballet.getProgress.mockResolvedValue({
      totalXp: 98n,
      level: 1,
      xpToNextLevel: 2n,
      stats: {
        technique: 2,
        flexibility: 0,
        musicality: 0,
        performance: 0,
        pointe: 0,
        stamina: 0,
      },
    });

    await balletCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(services.ballet.getProgress).toHaveBeenCalledWith('222222222222222222');
    expect(defer).toHaveBeenCalledWith();
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.balletStatusTitle,
          description: 'Ballet Level 1 · 98 XP\n2 XP to the next level.',
        }),
      ],
    });
  });

  it('lists activities with their reward and unlock state', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      { type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND, name: 'activities' },
    ]);
    const services = createServices();
    services.ballet.listActivities.mockResolvedValue([
      {
        code: 'stretching',
        displayName: 'Stretching',
        description: 'A gentle mobility session.',
        category: 'CONDITIONING',
        minimumLevel: 1,
        xpReward: 8n,
        slippersReward: 10n,
        statKey: 'flexibility',
        statGain: 2,
        requirementMet: true,
        requiredEquippedItemId: null,
        requiredActivityCode: null,
        lockReason: null,
        availability: 'AVAILABLE',
        nextAvailableAt: null,
      },
    ]);

    await balletCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.balletActivitiesTitle,
          description: `• **Stretching** — 8 XP, ${formatBalance(10n)} · Ready now`,
        }),
      ],
    });
  });

  it('uses the interaction ID for a practice and renders the reward result', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
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
      stat: { key: 'flexibility', gain: 2, value: 12 },
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
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.balletPracticeComplete,
          fields: [{ name: 'flexibility · +2', value: '12/100', inline: true }],
          description: `Stretching · +15 Ballet XP · +${formatBalance(20n)}\nLevel 2 · 105 XP · 95 XP to the next level.`,
        }),
      ],
    });
  });

  it('keeps deterministic reward facts visible when the persona title is generated', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
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
    services.persona = {
      generate: vi.fn().mockResolvedValue('Encore, the studio is glowing.'),
    };
    services.ballet.practice.mockResolvedValue({
      activityCode: 'stretching',
      displayName: 'Stretching',
      xpAwarded: 15n,
      slippersAwarded: 20n,
      stat: { key: 'flexibility', gain: 2, value: 12 },
      totalXp: 105n,
      level: 2,
      nextLevelXp: 95n,
      nextAvailableAt: new Date('2026-10-01T12:30:00.000Z'),
      walletBalance: 220n,
      replayed: false,
    });

    await balletCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.persona.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'ballet',
        action: 'practice_complete',
        facts: expect.objectContaining({
          activity: 'stretching',
          xp_gained: '15',
          slippers_gained: '20',
          stat: 'flexibility',
          stat_gain: 2,
          level: 2,
          xp_to_next_level: '95',
        }),
      }),
      '222222222222222222',
      undefined,
    );
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: 'Encore, the studio is glowing.',
          fields: [{ name: 'flexibility · +2', value: '12/100', inline: true }],
          description: `Stretching · +15 Ballet XP · +${formatBalance(20n)}\nLevel 2 · 105 XP · 95 XP to the next level.`,
        }),
      ],
    });
  });
});
