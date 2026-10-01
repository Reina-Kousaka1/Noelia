import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { shopCommand } from '../../src/commands/shop/shop.command.js';
import type { ShopItem } from '../../src/shop/types.js';

function createInteraction(options: Eris.InteractionDataOptions[]) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const createFollowup = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: '111111111111111111',
    member: { id: '222222222222222222' },
    data: { options },
    defer,
    createFollowup,
  } as unknown as Eris.CommandInteraction;

  return { interaction, defer, createFollowup };
}

function createServices() {
  return {
    economy: { getBalance: vi.fn() },
    daily: { claimDaily: vi.fn() },
    ballet: { getProgress: vi.fn(), listActivities: vi.fn(), practice: vi.fn() },
    shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
  };
}

const item: ShopItem = {
  itemId: 'satin-ribbon-bow',
  displayName: 'Satin Ribbon Bow',
  description: 'A soft blush satin bow for a neat studio bun.',
  category: 'hair_accessory',
  rarity: 'common',
  price: 80n,
  active: true,
  purchasable: true,
  stackable: false,
  minimumBalletLevel: 1,
  collection: 'First Position',
  cosmeticMetadata: { color: 'blush-pink' },
};

describe('shop command', () => {
  it('defines browse, item, and buy subcommands', () => {
    expect(shopCommand.definition.options?.map((option) => option.name)).toEqual([
      'browse',
      'item',
      'buy',
    ]);
  });

  it('browses a category in a private response', async () => {
    const { interaction, defer, createFollowup } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'browse',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'category',
            value: 'hair_accessory',
          },
        ],
      },
    ]);
    const services = createServices();
    services.shop.listItems.mockResolvedValue([item]);

    await shopCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(services.shop.listItems).toHaveBeenCalledWith('hair_accessory');
    expect(defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(createFollowup).toHaveBeenCalledWith({
      content: '• **Satin Ribbon Bow** — hair accessory · common · 80 🩰 · Ballet level 1+',
    });
  });

  it('shows stable item details', async () => {
    const { interaction, createFollowup } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'item',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'item',
            value: 'satin-ribbon-bow',
          },
        ],
      },
    ]);
    const services = createServices();
    services.shop.getItem.mockResolvedValue(item);

    await shopCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(createFollowup).toHaveBeenCalledWith({
      content:
        '**Satin Ribbon Bow** · common\nA soft blush satin bow for a neat studio bun.\nPrice: 80 🩰. Ballet level 1+ required.',
    });
  });

  it('uses the Discord interaction ID and quantity when buying an item', async () => {
    const { interaction, createFollowup } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'buy',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'item',
            value: 'satin-ribbon-bow',
          },
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.INTEGER,
            name: 'quantity',
            value: 1,
          },
        ],
      },
    ]);
    const services = createServices();
    services.shop.purchase.mockResolvedValue({
      item,
      quantity: 1,
      unitPrice: 80n,
      totalPrice: 80n,
      inventoryQuantity: 1,
      walletBalance: 220n,
      replayed: false,
    });

    await shopCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(services.shop.purchase).toHaveBeenCalledWith(
      '111111111111111111',
      '222222222222222222',
      'satin-ribbon-bow',
      1,
    );
    expect(createFollowup).toHaveBeenCalledWith({
      content: 'Purchase complete: 1 × Satin Ribbon Bow for 80 🩰. Wallet: 220 🩰. You own 1.',
    });
  });
});
