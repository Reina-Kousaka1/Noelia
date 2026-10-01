import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { GAMEPLAY_CONFIG } from '../../src/config/gameplay.js';
import { dailyCommand } from '../../src/commands/daily/daily.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';
import { formatBalance } from '../../src/commands/balance/format-balance.js';

describe('daily command', () => {
  it('uses the interaction ID for the claim and replies privately with its reward', async () => {
    const nextClaimAt = new Date('2026-10-02T12:00:00.000Z');
    const defer = vi.fn().mockResolvedValue(undefined);
    const createFollowup = vi.fn().mockResolvedValue(undefined);
    const claimDaily = vi.fn().mockResolvedValue({
      rewardAmount: GAMEPLAY_CONFIG.dailyRewardAmount,
      balance: 375n,
      claimedAt: new Date('2026-10-01T12:00:00.000Z'),
      nextClaimAt,
      replayed: false,
    });
    const interaction = {
      id: '111111111111111111',
      member: { id: '222222222222222222' },
      defer,
      createFollowup,
    } as unknown as Eris.CommandInteraction;

    await dailyCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: {
        economy: { getBalance: vi.fn() },
        daily: { claimDaily },
        ballet: { getProgress: vi.fn(), listActivities: vi.fn(), practice: vi.fn() },
        shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
        inventory: { listInventory: vi.fn() },
        wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
        profile: { getProfile: vi.fn() },
      },
    });

    expect(claimDaily).toHaveBeenCalledWith(interaction.id, interaction.member?.id);
    expect(defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.dailyTitle,
          description: `${NOELIA_COPY.dailyClaimed}\n+${formatBalance(100n)} · Balance ${formatBalance(375n)}\nNext in <t:1790942400:R>.`,
        }),
      ],
    });
  });
});
