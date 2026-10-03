import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { profileCommand } from '../../src/commands/profile/profile.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';

function createContext(profile: unknown) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    member: { id: '222222222222222222' },
    acknowledged: true,

    defer,
    editOriginalMessage,
  } as unknown as Eris.CommandInteraction;
  const services = {
    economy: { getBalance: vi.fn() },
    daily: { claimDaily: vi.fn() },
    ballet: { getProgress: vi.fn(), listActivities: vi.fn(), practice: vi.fn() },
    shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
    inventory: { listInventory: vi.fn() },
    wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
    profile: { getProfile: vi.fn().mockResolvedValue(profile) },
  };
  return { interaction, services, defer, editOriginalMessage };
}

describe('profile command', () => {
  it('renders Ballet stats, collections, featured badge, and outfit publicly', async () => {
    const { interaction, services, defer, editOriginalMessage } = createContext({
      balletSlippers: 1_240n,
      marriage: {
        relationshipId: '31',
        guildId: '333333333333333333',
        partnerUserId: '444444444444444444',
        marriedAt: new Date('2026-10-01T11:00:00.000Z'),
      },
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
          equippedAt: new Date('2026-10-01T12:00:00.000Z'),
        },
      ],
      completedCollections: 2,
      totalCollections: 11,
      featuredAchievement: {
        achievementId: 'first-steps',
        displayName: 'First Steps',
        description: 'Complete your first Ballet activity.',
        badgeMark: '🩰',
      },
      academy: {
        currentRank: {
          id: 'student',
          title: 'Studio Student',
          description: 'Your Ballet journey begins with the next class.',
          requirements: [],
        },
        nextRank: null,
        completedRankCount: 0,
      },
      academyUniform: { ready: true, look: ['First Class Leotard'] },
      knowledge: {
        domains: [
          {
            domain: 'ballet_french',
            domainName: 'Ballet French',
            points: 5,
            completedLessons: 1,
            totalLessons: 1,
          },
        ],
      },
    });

    await profileCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.profile.getProfile).toHaveBeenCalledWith('222222222222222222');
    expect(defer).toHaveBeenCalledWith();
    const response = editOriginalMessage.mock.calls[0]?.[0];
    const description = response?.embeds?.[0]?.description;
    expect(description).toContain('Ballet Level 3');
    expect(description).toContain('Academy: Studio Student');
    expect(description).toContain('Knowledge: 5 points · 1/1 lessons');
    expect(description).toContain('Technique 10 · Flexibility 20 · Musicality 30');
    expect(description).toContain('Performance 40 · Pointe 5 · Stamina 6');
    expect(description).toContain('Satin Ribbon Bow');
    expect(description).toContain(NOELIA_COPY.profileCollectionProgress(2, 11));
    expect(description).toContain(NOELIA_COPY.profileMarriage('444444444444444444'));
    expect(description).toContain(NOELIA_COPY.profileFeaturedAchievement('🩰', 'First Steps'));
  });

  it('shows empty outfit and no extra progress at maximum Ballet level', async () => {
    const { interaction, services, editOriginalMessage } = createContext({
      balletSlippers: 0n,
      marriage: null,
      ballet: {
        totalXp: 9_900n,
        level: 100,
        xpToNextLevel: null,
        stats: {
          technique: 100,
          flexibility: 100,
          musicality: 100,
          performance: 100,
          pointe: 100,
          stamina: 100,
        },
      },
      outfit: [],
      completedCollections: 0,
      totalCollections: 11,
      featuredAchievement: null,
      academy: {
        currentRank: {
          id: 'principal-artist',
          title: 'Principal Artist',
          description: 'Bring the full studio journey together in a Prima Audition.',
          requirements: [],
        },
        nextRank: null,
        completedRankCount: 4,
      },
      academyUniform: { ready: false, look: [] },
      knowledge: { domains: [] },
    });

    await profileCommand.execute({ client: {} as Eris.Client, interaction, services });

    const response = editOriginalMessage.mock.calls[0]?.[0];
    const description = response?.embeds?.[0]?.description;
    expect(description).toContain('Maximum Ballet level reached.');
    expect(description).toContain(NOELIA_COPY.wardrobeEmpty);
    expect(description).toContain(NOELIA_COPY.profileCollectionProgress(0, 11));
    expect(description).toContain(NOELIA_COPY.profileMarriage(null));
    expect(description).toContain(NOELIA_COPY.profileNoFeaturedAchievement);
  });
});
