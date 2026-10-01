import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { marketCommand } from '../../src/commands/market/market.command.js';
import { MarketplacePriceError } from '../../src/marketplace/errors.js';

const userId = '222222222222222222';
const interactionId = '111111111111111111';

function createInteraction(
  subcommand: string,
  options: readonly { name: string; value: unknown }[],
) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: interactionId,
    member: { id: userId },
    data: { options: [{ name: subcommand, options }] },
    acknowledged: true,

    defer,
    editOriginalMessage,
  } as unknown as Eris.CommandInteraction;
  return { interaction, defer, editOriginalMessage };
}

describe('market command', () => {
  it('browses active listings in a public response', async () => {
    const { interaction, defer, editOriginalMessage } = createInteraction('browse', [
      { name: 'page', value: 2 },
    ]);
    const marketplace = {
      browse: vi.fn().mockResolvedValue({
        listings: [
          {
            listingId: '42',
            sellerUserId: '333333333333333333',
            itemId: 'satin-ribbon-bow',
            displayName: 'Satin Ribbon Bow',
            category: 'hair_accessory',
            rarity: 'common',
            quantity: 1,
            unitPrice: 125n,
            status: 'ACTIVE',
            createdAt: new Date('2026-10-01T12:00:00.000Z'),
          },
        ],
        page: 2,
        pageSize: 10,
        totalListings: 11,
        totalPages: 2,
      }),
      listMine: vi.fn(),
      createListing: vi.fn(),
      buy: vi.fn(),
      cancel: vi.fn(),
    };

    await marketCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { marketplace } as never,
    });

    expect(marketplace.browse).toHaveBeenCalledWith(2);
    expect(defer).toHaveBeenCalledWith();
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          description: expect.stringContaining('#42 **Satin Ribbon Bow**'),
        }),
      ],
    });
  });

  it('creates a listing using the interaction ID and integer Ballet Slippers price', async () => {
    const { interaction, editOriginalMessage } = createInteraction('sell', [
      { name: 'item', value: 'satin-ribbon-bow' },
      { name: 'price', value: '125' },
      { name: 'quantity', value: 1 },
    ]);
    const marketplace = {
      browse: vi.fn(),
      listMine: vi.fn(),
      createListing: vi.fn().mockResolvedValue({
        listing: { listingId: '42', displayName: 'Satin Ribbon Bow', quantity: 1, unitPrice: 125n },
        replayed: false,
      }),
      buy: vi.fn(),
      cancel: vi.fn(),
    };

    await marketCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { marketplace } as never,
    });

    expect(marketplace.createListing).toHaveBeenCalledWith(
      interactionId,
      userId,
      'satin-ribbon-bow',
      1,
      125n,
    );
    expect(editOriginalMessage).toHaveBeenCalledOnce();
  });

  it('rejects non-integer prices before invoking the marketplace service', async () => {
    const { interaction } = createInteraction('sell', [
      { name: 'item', value: 'satin-ribbon-bow' },
      { name: 'price', value: '1.25' },
    ]);
    const marketplace = {
      browse: vi.fn(),
      listMine: vi.fn(),
      createListing: vi.fn(),
      buy: vi.fn(),
      cancel: vi.fn(),
    };

    await expect(
      marketCommand.execute({
        client: {} as Eris.Client,
        interaction,
        services: { marketplace } as never,
      }),
    ).rejects.toBeInstanceOf(MarketplacePriceError);
    expect(marketplace.createListing).not.toHaveBeenCalled();
  });

  it('dispatches buy and cancel using stable listing identifiers', async () => {
    const purchaseInteraction = createInteraction('buy', [{ name: 'listing', value: '42' }]);
    const cancelInteraction = createInteraction('cancel', [{ name: 'listing', value: '42' }]);
    const marketplace = {
      browse: vi.fn(),
      listMine: vi.fn(),
      createListing: vi.fn(),
      buy: vi.fn().mockResolvedValue({
        listing: { listingId: '42', displayName: 'Satin Ribbon Bow', quantity: 1 },
        totalPrice: 125n,
        buyerBalance: 75n,
        sellerBalance: 125n,
        replayed: false,
      }),
      cancel: vi.fn().mockResolvedValue({
        listing: { listingId: '42', displayName: 'Satin Ribbon Bow', quantity: 1 },
        replayed: false,
      }),
    };

    await marketCommand.execute({
      client: {} as Eris.Client,
      interaction: purchaseInteraction.interaction,
      services: { marketplace } as never,
    });
    await marketCommand.execute({
      client: {} as Eris.Client,
      interaction: cancelInteraction.interaction,
      services: { marketplace } as never,
    });

    expect(marketplace.buy).toHaveBeenCalledWith(interactionId, userId, '42');
    expect(marketplace.cancel).toHaveBeenCalledWith(interactionId, userId, '42');
  });
});
