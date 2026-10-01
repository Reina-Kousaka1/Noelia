import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { inventoryCommand } from '../../src/commands/inventory/inventory.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';

function createInteraction(options: Eris.InteractionDataOptions[] = []) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const createFollowup = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    member: { id: '222222222222222222' },
    data: { options },
    defer,
    createFollowup,
  } as unknown as Eris.CommandInteraction;

  return { interaction, defer, createFollowup };
}

describe('inventory command', () => {
  it('lists a selected inventory page in an ephemeral response', async () => {
    const { interaction, defer, createFollowup } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.INTEGER,
        name: 'page',
        value: 2,
      },
    ]);
    const services = {
      economy: { getBalance: vi.fn() },
      daily: { claimDaily: vi.fn() },
      ballet: { getProgress: vi.fn(), listActivities: vi.fn(), practice: vi.fn() },
      shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
      inventory: {
        listInventory: vi.fn().mockResolvedValue({
          entries: [
            {
              itemId: 'satin-ribbon-bow',
              displayName: 'Satin Ribbon Bow',
              category: 'hair_accessory',
              rarity: 'common',
              quantity: 2,
              acquiredAt: new Date('2026-10-01T12:00:00.000Z'),
              source: 'SHOP_PURCHASE',
            },
          ],
          page: 2,
          pageSize: 10,
          totalItems: 12,
          totalPages: 2,
        }),
      },
      wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
      profile: { getProfile: vi.fn() },
    };

    await inventoryCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.inventory.listInventory).toHaveBeenCalledWith('222222222222222222', 2);
    expect(defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.inventoryTitle,
          description:
            'Your inventory · Page 2/2\n**Satin Ribbon Bow** (`satin-ribbon-bow`) · Common · hair accessory · ×2',
        }),
      ],
    });
  });

  it('uses page one by default when the inventory is empty', async () => {
    const { interaction, createFollowup } = createInteraction();
    const services = {
      economy: { getBalance: vi.fn() },
      daily: { claimDaily: vi.fn() },
      ballet: { getProgress: vi.fn(), listActivities: vi.fn(), practice: vi.fn() },
      shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
      inventory: {
        listInventory: vi.fn().mockResolvedValue({
          entries: [],
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 1,
        }),
      },
      wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
      profile: { getProfile: vi.fn() },
    };

    await inventoryCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.inventory.listInventory).toHaveBeenCalledWith('222222222222222222', 1);
    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.inventoryTitle,
          description: NOELIA_COPY.inventoryEmpty,
        }),
      ],
    });
  });
});
