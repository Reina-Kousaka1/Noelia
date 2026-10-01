import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { achievementsCommand } from '../../src/commands/achievements/achievements.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';
import type { AchievementSummary } from '../../src/achievements/types.js';

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
    achievements: {
      list: vi.fn(),
      getFeatured: vi.fn(),
      feature: vi.fn(),
      clearFeatured: vi.fn(),
    },
  };
}

describe('achievements command', () => {
  it('defines list, feature, and clear-featured subcommands', () => {
    expect(achievementsCommand.definition.options?.map((option) => option.name)).toEqual([
      'list',
      'feature',
      'clear_featured',
    ]);
  });

  it('lists locked and unlocked milestones publicly', async () => {
    const { interaction, defer, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'list',
      },
    ]);
    const services = createServices();
    const achievements: AchievementSummary[] = [
      {
        achievementId: 'first-steps',
        displayName: 'First Steps',
        description: 'Complete your first Ballet activity.',
        badgeMark: '🩰',
        unlockedAt: new Date('2026-10-01T12:00:00.000Z'),
        featured: true,
      },
      {
        achievementId: 'first-performance',
        displayName: 'First Performance',
        description: 'Complete your first Ballet performance.',
        badgeMark: '🦢',
        unlockedAt: null,
        featured: false,
      },
    ];
    services.achievements.list.mockResolvedValue(achievements);

    await achievementsCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: services as never,
    });

    expect(defer).toHaveBeenCalledWith();
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.achievementsTitle,
          description: expect.stringContaining('ID: first-performance'),
        }),
      ],
    });
  });

  it('uses celebratory prose while keeping milestone facts in the deterministic response', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'list',
      },
    ]);
    const services = createServices();
    const achievements: AchievementSummary[] = [
      {
        achievementId: 'first-steps',
        displayName: 'First Steps',
        description: 'Complete your first Ballet activity.',
        badgeMark: '🩰',
        unlockedAt: new Date('2026-10-01T12:00:00.000Z'),
        featured: true,
      },
      {
        achievementId: 'first-performance',
        displayName: 'First Performance',
        description: 'Complete your first Ballet performance.',
        badgeMark: '🦢',
        unlockedAt: null,
        featured: false,
      },
    ];
    services.achievements.list.mockResolvedValue(achievements);
    const generate = vi.fn().mockResolvedValue('Bravo, every milestone has its own little glow.');
    const servicesWithPersona = { ...services, persona: { generate } };

    await achievementsCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: servicesWithPersona as never,
    });

    expect(generate).toHaveBeenCalledWith(
      {
        domain: 'achievements',
        action: 'list_view',
        facts: { achievement_count: 2, unlocked_count: 1, featured_count: 1 },
      },
      '222222222222222222',
      undefined,
    );
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: 'Bravo, every milestone has its own little glow.',
          description: expect.stringContaining('ID: first-performance'),
        }),
      ],
    });
  });

  it('features an unlocked achievement using the interaction ID for replay safety', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'feature',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'achievement_id',
            value: 'first-steps',
          },
        ],
      },
    ]);
    const services = createServices();
    services.achievements.feature.mockResolvedValue({
      achievement: {
        achievementId: 'first-steps',
        displayName: 'First Steps',
        description: 'Complete your first Ballet activity.',
        badgeMark: '🩰',
      },
      replayed: false,
    });

    await achievementsCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: services as never,
    });

    expect(services.achievements.feature).toHaveBeenCalledWith(
      '111111111111111111',
      '222222222222222222',
      'first-steps',
    );
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.achievementFeatureTitle,
          description: NOELIA_COPY.achievementFeaturedSummary('🩰', 'First Steps'),
        }),
      ],
    });
  });
});
