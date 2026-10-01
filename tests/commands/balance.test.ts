import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { balanceCommand } from '../../src/commands/balance/balance.command.js';
import { formatBalance } from '../../src/commands/balance/format-balance.js';

describe('balance command', () => {
  it('uses the caller wallet and responds publicly with a formatted balance', async () => {
    const defer = vi.fn().mockResolvedValue(undefined);
    const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
    const getBalance = vi.fn().mockResolvedValue(1_240n);
    const interaction = {
      member: { id: '123456789012345678' },
      acknowledged: true,

      defer,
      editOriginalMessage,
    } as unknown as Eris.CommandInteraction;

    await balanceCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: {
        economy: { getBalance },
        daily: { claimDaily: vi.fn() },
        ballet: { getProgress: vi.fn(), listActivities: vi.fn(), practice: vi.fn() },
        shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
        inventory: { listInventory: vi.fn() },
        wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
        profile: { getProfile: vi.fn() },
      },
    });

    expect(getBalance).toHaveBeenCalledWith('123456789012345678');
    expect(defer).toHaveBeenCalledWith();
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: 'Your Ballet Slippers',
          description: formatBalance(1_240n),
        }),
      ],
    });
  });

  it('formats zero and large bigint balances without floating-point conversion', () => {
    expect(formatBalance(0n)).toBe('0 🩰');
    expect(formatBalance(9_223_372_036_854_775_807n)).toBe('9,223,372,036,854,775,807 🩰');
  });
});
