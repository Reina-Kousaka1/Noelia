import * as Eris from 'eris';
import { completeCommand, deferCommand } from '../../interactions/response-policy.js';

import type { SlashCommand } from '../command.js';
import { formatBalance } from '../balance/format-balance.js';
import { NOELIA_COPY } from '../../persona/copy.js';
import { MarketplacePriceError } from '../../marketplace/errors.js';
import { createPersonaEmbedRenderer } from '../../persona/presentation.js';

const integerOption = Eris.Constants.ApplicationCommandOptionTypes.INTEGER;
const stringOption = Eris.Constants.ApplicationCommandOptionTypes.STRING;
const subcommandOption = Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND;

export const marketCommand: SlashCommand = {
  definition: {
    name: 'market',
    description: 'Exchange owned Ballet pieces with other dancers.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'browse',
        description: 'Browse active listings.',
        type: subcommandOption,
        options: [
          {
            name: 'page',
            description: 'Page number (defaults to 1).',
            type: integerOption,
            required: false,
          },
        ],
      },
      {
        name: 'sell',
        description: 'List an item you own for Ballet Slippers.',
        type: subcommandOption,
        options: [
          {
            name: 'item',
            description: 'Stable item ID from /inventory.',
            type: stringOption,
            required: true,
          },
          {
            name: 'price',
            description: 'Ballet Slippers per item (whole number).',
            type: stringOption,
            required: true,
          },
          {
            name: 'quantity',
            description: 'Units to list (defaults to 1).',
            type: integerOption,
            required: false,
          },
        ],
      },
      {
        name: 'buy',
        description: 'Purchase an active listing.',
        type: subcommandOption,
        options: [
          {
            name: 'listing',
            description: 'Listing number shown by /market browse.',
            type: stringOption,
            required: true,
          },
        ],
      },
      {
        name: 'cancel',
        description: 'Cancel one of your active listings.',
        type: subcommandOption,
        options: [
          {
            name: 'listing',
            description: 'Your listing number shown by /market mine.',
            type: stringOption,
            required: true,
          },
        ],
      },
      {
        name: 'mine',
        description: 'Review your recent listings.',
        type: subcommandOption,
        options: [
          {
            name: 'page',
            description: 'Page number (defaults to 1).',
            type: integerOption,
            required: false,
          },
        ],
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;
    if (discordUserId === undefined) {
      throw new Error('The market command requires a guild member context.');
    }
    const personaEmbed = createPersonaEmbedRenderer(services.persona, 'market', discordUserId);
    const market = services.marketplace;
    if (market === undefined) {
      throw new Error('The marketplace service is not configured.');
    }

    const subcommand = interaction.data.options?.[0];
    if (subcommand === undefined) {
      throw new Error('The market command requires a subcommand.');
    }
    const options = 'options' in subcommand ? subcommand.options : undefined;
    const readString = (name: string): string | undefined => {
      const option = options?.find((candidate) => candidate.name === name);
      return option !== undefined && 'value' in option && typeof option.value === 'string'
        ? option.value
        : undefined;
    };
    const readInteger = (name: string, fallback: number): number => {
      const option = options?.find((candidate) => candidate.name === name);
      return option !== undefined && 'value' in option && typeof option.value === 'number'
        ? option.value
        : fallback;
    };

    await deferCommand(interaction);

    if (subcommand.name === 'browse' || subcommand.name === 'mine') {
      const page = readInteger('page', 1);
      const result =
        subcommand.name === 'browse'
          ? await market.browse(page)
          : await market.listMine(discordUserId, page);
      const lines = result.listings.map(
        (listing) =>
          `#${listing.listingId} **${listing.displayName}** · ${listing.quantity} · ${formatBalance(listing.unitPrice)} each · ${listing.status}${subcommand.name === 'browse' ? ` · <@${listing.sellerUserId}>` : ''}`,
      );
      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            subcommand.name === 'mine' ? 'my_listings' : 'browse',
            {
              listing_count: result.listings.length,
              page: result.page,
              total_pages: result.totalPages,
            },
            {
              title: NOELIA_COPY.marketTitle,
              description:
                lines.length === 0
                  ? NOELIA_COPY.marketEmpty
                  : `Page ${result.page}/${result.totalPages}\n${lines.join('\n')}`,
            },
          ),
        ],
      });
      return;
    }

    if (subcommand.name === 'sell') {
      const itemId = readString('item');
      const priceText = readString('price');
      const quantity = readInteger('quantity', 1);
      if (itemId === undefined || priceText === undefined) {
        throw new Error('The market sell item or price is missing.');
      }
      if (!/^[1-9][0-9]{0,18}$/.test(priceText)) {
        throw new MarketplacePriceError();
      }
      const listing = await market.createListing(
        interaction.id,
        discordUserId,
        itemId,
        quantity,
        BigInt(priceText),
      );
      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            listing.replayed ? 'listing_replayed' : 'listing_created',
            {
              quantity: listing.listing.quantity,
              unit_price: listing.listing.unitPrice.toString(),
              replayed: listing.replayed,
            },
            {
              title: NOELIA_COPY.marketListingCreated,
              description: `#${listing.listing.listingId} · ${listing.listing.displayName} · ${listing.listing.quantity} · ${formatBalance(listing.listing.unitPrice)} each`,
              tone: listing.replayed ? 'signature' : 'success',
            },
          ),
        ],
      });
      return;
    }

    if (subcommand.name === 'buy') {
      const listingId = readString('listing');
      if (listingId === undefined) {
        throw new Error('The market buy listing number is missing.');
      }
      const purchase = await market.buy(interaction.id, discordUserId, listingId);
      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            purchase.replayed ? 'purchase_replayed' : 'purchase_complete',
            {
              quantity: purchase.listing.quantity,
              total_price: purchase.totalPrice.toString(),
              wallet_balance: purchase.buyerBalance.toString(),
              replayed: purchase.replayed,
            },
            {
              title: purchase.replayed
                ? NOELIA_COPY.marketPurchaseReplayed
                : NOELIA_COPY.marketPurchaseComplete,
              description: `#${purchase.listing.listingId} · ${purchase.listing.displayName} · ${purchase.listing.quantity}\nPaid ${formatBalance(purchase.totalPrice)} · Wallet ${formatBalance(purchase.buyerBalance)}`,
              tone: purchase.replayed ? 'signature' : 'success',
            },
          ),
        ],
      });
      return;
    }

    if (subcommand.name === 'cancel') {
      const listingId = readString('listing');
      if (listingId === undefined) {
        throw new Error('The market cancel listing number is missing.');
      }
      const cancelled = await market.cancel(interaction.id, discordUserId, listingId);
      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            cancelled.replayed ? 'cancel_replayed' : 'listing_cancelled',
            {
              quantity: cancelled.listing.quantity,
              replayed: cancelled.replayed,
            },
            {
              title: NOELIA_COPY.marketListingCancelled,
              description: `#${cancelled.listing.listingId} · ${cancelled.listing.displayName} · ${cancelled.listing.quantity}`,
              tone: 'success',
            },
          ),
        ],
      });
      return;
    }

    throw new Error('Unsupported market subcommand.');
  },
};
