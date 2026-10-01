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
    const service = new ProfileService(wallet, ballet, wardrobe);

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
    });
    expect(wallet.getBalance).toHaveBeenCalledWith(discordUserId);
    expect(ballet.getProgress).toHaveBeenCalledWith(discordUserId);
    expect(wardrobe.getOutfit).toHaveBeenCalledWith(discordUserId);
  });

  it('validates the Discord identity before calling domain readers', async () => {
    const wallet = { getBalance: vi.fn() };
    const ballet = { getProgress: vi.fn() };
    const wardrobe = { getOutfit: vi.fn() };
    const service = new ProfileService(wallet, ballet, wardrobe);

    await expect(service.getProfile('not-a-snowflake')).rejects.toThrow(
      'Discord user ID must be a 17- to 20-digit numeric ID.',
    );
    expect(wallet.getBalance).not.toHaveBeenCalled();
    expect(ballet.getProgress).not.toHaveBeenCalled();
    expect(wardrobe.getOutfit).not.toHaveBeenCalled();
  });
});
