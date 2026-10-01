import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { shopCommand } from '../../src/commands/shop/shop.command.js';
import type { ShopItem } from '../../src/shop/types.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';
import { formatBalance } from '../../src/commands/balance/format-balance.js';

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
    inventory: { listInventory: vi.fn() },
    wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
    profile: { getProfile: vi.fn() },
    collections: { listProgress: vi.fn() },
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
  it('defines browse, collections, item, and buy subcommands', () => {
    expect(shopCommand.definition.options?.map((option) => option.name)).toEqual([
      'browse',
      'collections',
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
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.shopTitle,
          description: `Page 1/1\n**Satin Ribbon Bow** (\`satin-ribbon-bow\`) — hair accessory · Common · ${formatBalance(80n)} · Ballet level 1+ · First Position`,
        }),
      ],
    });
  });

  it('paginates the larger catalog and exposes stable item IDs instead of a capped choice list', async () => {
    const { interaction, createFollowup } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'browse',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.INTEGER,
            name: 'page',
            value: 2,
          },
        ],
      },
    ]);
    const services = createServices();
    services.shop.listItems.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        ...item,
        itemId: `catalog-piece-${index + 1}`,
        displayName: `Catalog Piece ${index + 1}`,
      })),
    );

    await shopCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          description: expect.stringContaining('Page 2/2'),
        }),
      ],
    });
    const response = vi.mocked(createFollowup).mock.calls[0]?.[0];
    const description = response?.embeds?.[0]?.description;
    expect(description).toContain('catalog-piece-11');
    expect(description).not.toContain('catalog-piece-1)');
    const buyOption = shopCommand.definition.options?.find((option) => option.name === 'buy');
    if (buyOption?.type === Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND) {
      expect(buyOption.options?.[0]).not.toHaveProperty('choices');
    } else {
      throw new Error('The buy command must be a slash subcommand.');
    }
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
      embeds: [
        expect.objectContaining({
          title: `${NOELIA_COPY.shopItemTitle}: Satin Ribbon Bow`,
          description: `Common · A soft blush satin bow for a neat studio bun.\nPrice: ${formatBalance(80n)}. Ballet level 1+ required.`,
        }),
      ],
    });
  });

  it('shows owned progress for each collection', async () => {
    const { interaction, createFollowup } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'collections',
      },
    ]);
    const services = createServices();
    services.collections = {
      listProgress: vi.fn().mockResolvedValue([
        {
          collectionId: 'first-position',
          displayName: 'First Position',
          description: 'Gentle first pieces.',
          ownedItems: 2,
          totalItems: 3,
          complete: false,
        },
      ]),
    };

    await shopCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(services.collections.listProgress).toHaveBeenCalledWith('222222222222222222');
    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [expect.objectContaining({ description: expect.stringContaining('2/3') })],
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
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.shopPurchaseComplete,
          description: `1 × Satin Ribbon Bow · ${formatBalance(80n)}\nWallet: ${formatBalance(220n)} · Owned: 1`,
        }),
      ],
    });
  });
});
