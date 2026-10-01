import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { balanceCommand } from '../../src/commands/balance/balance.command.js';
import { formatBalance } from '../../src/commands/balance/format-balance.js';

describe('balance command', () => {
  it('uses the caller wallet and responds privately with a formatted balance', async () => {
    const createMessage = vi.fn().mockResolvedValue(undefined);
    const getBalance = vi.fn().mockResolvedValue(1_240n);
    const interaction = {
      member: { id: '123456789012345678' },
      createMessage,
    } as unknown as Eris.CommandInteraction;

    await balanceCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { economy: { getBalance } },
    });

    expect(getBalance).toHaveBeenCalledWith('123456789012345678');
    expect(createMessage).toHaveBeenCalledWith({
      content: 'Your Ballet Slippers: 1,240 🩰',
      flags: Eris.Constants.MessageFlags.EPHEMERAL,
    });
  });

  it('formats zero and large bigint balances without floating-point conversion', () => {
    expect(formatBalance(0n)).toBe('0 🩰');
    expect(formatBalance(9_223_372_036_854_775_807n)).toBe('9,223,372,036,854,775,807 🩰');
  });
});
