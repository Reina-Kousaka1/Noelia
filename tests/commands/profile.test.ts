import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { profileCommand } from '../../src/commands/profile/profile.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';

describe('profile command', () => {
  it('renders profile data from the aggregator in an ephemeral response', async () => {
    const defer = vi.fn().mockResolvedValue(undefined);
    const createFollowup = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      member: { id: '222222222222222222' },
      defer,
      createFollowup,
    } as unknown as Eris.CommandInteraction;
    const services = {
      economy: { getBalance: vi.fn() },
      daily: { claimDaily: vi.fn() },
      ballet: { getProgress: vi.fn(), listActivities: vi.fn(), practice: vi.fn() },
      shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
      inventory: { listInventory: vi.fn() },
      wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
      profile: {
        getProfile: vi.fn().mockResolvedValue({
          balletSlippers: 1_240n,
          ballet: { totalXp: 240n, level: 3, xpToNextLevel: 60n },
          outfit: [
            {
              itemId: 'satin-ribbon-bow',
              displayName: 'Satin Ribbon Bow',
              slots: ['hair_accessory'],
              equippedAt: new Date('2026-10-01T12:00:00.000Z'),
            },
          ],
        }),
      },
    };

    await profileCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(services.profile.getProfile).toHaveBeenCalledWith('222222222222222222');
    expect(defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.profileTitle,
          description:
            'Ballet Level 3 · 240 XP · 60 XP to the next level.\nBallet Slippers: 1,240 🩰\nCurrent look\n• **Satin Ribbon Bow** — hair accessory',
        }),
      ],
    });
  });

  it('shows empty outfit and a reached level without suggesting more progress', async () => {
    const createFollowup = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      member: { id: '222222222222222222' },
      defer: vi.fn().mockResolvedValue(undefined),
      createFollowup,
    } as unknown as Eris.CommandInteraction;
    const services = {
      economy: { getBalance: vi.fn() },
      daily: { claimDaily: vi.fn() },
      ballet: { getProgress: vi.fn(), listActivities: vi.fn(), practice: vi.fn() },
      shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
      inventory: { listInventory: vi.fn() },
      wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
      profile: {
        getProfile: vi.fn().mockResolvedValue({
          balletSlippers: 0n,
          ballet: { totalXp: 9_900n, level: 100, xpToNextLevel: null },
          outfit: [],
        }),
      },
    };

    await profileCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.profileTitle,
          description: `Ballet Level 100 · 9,900 XP · Maximum Ballet level reached.\nBallet Slippers: 0 🩰\n${NOELIA_COPY.currentLook}\n${NOELIA_COPY.wardrobeEmpty}`,
        }),
      ],
    });
  });
});
