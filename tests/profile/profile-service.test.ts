import { describe, expect, it, vi } from 'vitest';

import { ProfileService } from '../../src/profile/profile-service.js';

describe('ProfileService', () => {
  it('aggregates wallet, Ballet progress, and outfit without owning their state', async () => {
    const discordUserId = '222222222222222222';
    const wallet = { getBalance: vi.fn().mockResolvedValue(1_240n) };
    const ballet = {
      getProgress: vi.fn().mockResolvedValue({
        totalXp: 240n,
        level: 3,
        xpToNextLevel: 60n,
        stats: {
          technique: 10,
          flexibility: 20,
          musicality: 30,
          performance: 40,
          pointe: 5,
          stamina: 6,
        },
      }),
    };
    const equippedAt = new Date('2026-10-01T12:00:00.000Z');
    const wardrobe = {
      getOutfit: vi.fn().mockResolvedValue([
        {
          itemId: 'satin-ribbon-bow',
          displayName: 'Satin Ribbon Bow',
          slots: ['hair_accessory'],
          equippedAt,
        },
      ]),
    };
    const collections = {
      listProgress: vi.fn().mockResolvedValue([
        { collectionId: 'first-position', complete: true },
        { collectionId: 'studio-essentials', complete: false },
      ]),
    };
    const featuredAchievement = {
      achievementId: 'first-steps' as const,
      displayName: 'First Steps',
      description: 'Complete your first Ballet activity.',
      badgeMark: '🩰',
    };
    const achievements = { getFeatured: vi.fn().mockResolvedValue(featuredAchievement) };
    const service = new ProfileService(wallet, ballet, wardrobe, collections, achievements);

    await expect(service.getProfile(discordUserId)).resolves.toEqual({
      balletSlippers: 1_240n,
      ballet: {
        totalXp: 240n,
        level: 3,
        xpToNextLevel: 60n,
        stats: {
          technique: 10,
          flexibility: 20,
          musicality: 30,
          performance: 40,
          pointe: 5,
          stamina: 6,
        },
      },
      outfit: [
        {
          itemId: 'satin-ribbon-bow',
          displayName: 'Satin Ribbon Bow',
          slots: ['hair_accessory'],
          equippedAt,
        },
      ],
      completedCollections: 1,
      totalCollections: 2,
      featuredAchievement,
    });
    expect(wallet.getBalance).toHaveBeenCalledWith(discordUserId);
    expect(ballet.getProgress).toHaveBeenCalledWith(discordUserId);
    expect(wardrobe.getOutfit).toHaveBeenCalledWith(discordUserId);
    expect(collections.listProgress).toHaveBeenCalledWith(discordUserId);
    expect(achievements.getFeatured).toHaveBeenCalledWith(discordUserId);
  });

  it('validates the Discord identity before calling domain readers', async () => {
    const wallet = { getBalance: vi.fn() };
    const ballet = { getProgress: vi.fn() };
    const wardrobe = { getOutfit: vi.fn() };
    const collections = { listProgress: vi.fn() };
    const achievements = { getFeatured: vi.fn() };
    const service = new ProfileService(wallet, ballet, wardrobe, collections, achievements);

    await expect(service.getProfile('not-a-snowflake')).rejects.toThrow(
      'Discord user ID must be a 17- to 20-digit numeric ID.',
    );
    expect(wallet.getBalance).not.toHaveBeenCalled();
    expect(ballet.getProgress).not.toHaveBeenCalled();
    expect(wardrobe.getOutfit).not.toHaveBeenCalled();
    expect(collections.listProgress).not.toHaveBeenCalled();
    expect(achievements.getFeatured).not.toHaveBeenCalled();
  });
});
