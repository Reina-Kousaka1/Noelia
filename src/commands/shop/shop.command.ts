import * as Eris from 'eris';

import { ShopItemUnavailableError } from '../../shop/errors.js';
import { SHOP_CATEGORIES } from '../../shop/types.js';
import { SHOP_RARITY_LABELS } from '../../shop/rarity.js';
import type { ShopCategory } from '../../shop/types.js';
import type { SlashCommand } from '../command.js';
import { formatBalance } from '../balance/format-balance.js';
import { createNoeliaEmbed } from '../../ui/embed.js';
import { NOELIA_COPY } from '../../persona/copy.js';

const categoryChoices = SHOP_CATEGORIES.map((category) => ({
  name: category
    .split('_')
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' '),
  value: category,
}));

export const shopCommand: SlashCommand = {
  definition: {
    name: 'shop',
    description: 'Browse and shop Noélia’s Ballet collection.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'browse',
        description: 'Browse the available Ballet collection.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'category',
            description: 'Filter the collection by category.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: false,
            choices: categoryChoices,
          },
          {
            name: 'page',
            description: 'Page number (defaults to 1).',
            type: Eris.Constants.ApplicationCommandOptionTypes.INTEGER,
            required: false,
          },
        ],
      },
      {
        name: 'collections',
        description: 'See how many pieces you own from each collection.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'item',
        description: 'See details for a shop item.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'item',
            description: 'Enter the stable item ID shown by /shop browse.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
          },
        ],
      },
      {
        name: 'buy',
        description: 'Purchase an item with Ballet Slippers.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'item',
            description: 'Enter the stable item ID shown by /shop browse.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
          },
          {
            name: 'quantity',
            description: 'Number from 1 to 99,999 (defaults to 1).',
            type: Eris.Constants.ApplicationCommandOptionTypes.INTEGER,
            required: false,
          },
        ],
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;

    if (discordUserId === undefined) {
      throw new Error('The shop command requires a guild member context.');
    }

    const subcommand = interaction.data.options?.[0];

    if (subcommand === undefined) {
      throw new Error('The shop command requires a subcommand.');
    }

    const subcommandOptions = 'options' in subcommand ? subcommand.options : undefined;
    const readStringOption = (name: string): string | undefined => {
      const option = subcommandOptions?.find((candidate) => candidate.name === name);
      return option !== undefined && 'value' in option && typeof option.value === 'string'
        ? option.value
        : undefined;
    };
    const readIntegerOption = (name: string, fallback: number): number => {
      const option = subcommandOptions?.find((candidate) => candidate.name === name);
      return option !== undefined && 'value' in option && typeof option.value === 'number'
        ? option.value
        : fallback;
    };
    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);

    if (subcommand.name === 'browse') {
      const category = readStringOption('category');
      const items = await services.shop.listItems(category as ShopCategory | undefined);
      const pageSize = 10;
      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      const requestedPage = readIntegerOption('page', 1);
      const page = Number.isSafeInteger(requestedPage)
        ? Math.max(1, Math.min(totalPages, requestedPage))
        : 1;
      const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
      const lines = pageItems.map(
        (item) =>
          `**${item.displayName}** (\`${item.itemId}\`) — ${item.category.replaceAll('_', ' ')} · ${SHOP_RARITY_LABELS[item.rarity]} · ${formatBalance(item.price)}${item.minimumBalletLevel === null ? '' : ` · Ballet level ${item.minimumBalletLevel}+`}${item.collection === null ? '' : ` · ${item.collection}`}`,
      );
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.shopTitle,
            description:
              lines.length === 0
                ? NOELIA_COPY.shopEmpty
                : `Page ${page}/${totalPages}\n${lines.join('\n')}`,
          }),
        ],
      });
      return;
    }

    if (subcommand.name === 'collections') {
      const collections = services.collections;
      if (collections === undefined) {
        throw new Error('The collection service is not configured.');
      }
      const progress = await collections.listProgress(discordUserId);
      const lines = progress.map(
        (collection) =>
          `**${collection.displayName}** · ${collection.ownedItems}/${collection.totalItems}${collection.complete ? ' · Complete' : ''}\n${collection.description}`,
      );
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.shopCollectionsTitle,
            description: lines.length === 0 ? NOELIA_COPY.shopCollectionsEmpty : lines.join('\n\n'),
          }),
        ],
      });
      return;
    }

    if (subcommand.name === 'item') {
      const itemId = readStringOption('item');
      const item = itemId === undefined ? undefined : await services.shop.getItem(itemId);

      if (item === undefined) {
        throw new ShopItemUnavailableError();
      }

      const requirement =
        item.minimumBalletLevel === null
          ? ''
          : ` Ballet level ${item.minimumBalletLevel}+ required.`;
      const purchaseState = item.purchasable ? '' : ' This item is not currently purchasable.';
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: `${NOELIA_COPY.shopItemTitle}: ${item.displayName}`,
            description: `${SHOP_RARITY_LABELS[item.rarity]} · ${item.description}\nPrice: ${formatBalance(item.price)}.${requirement}${purchaseState}`,
          }),
        ],
      });
      return;
    }

    if (subcommand.name === 'buy') {
      const itemId = readStringOption('item');
      const quantityOption = subcommandOptions?.find((candidate) => candidate.name === 'quantity');
      const quantity =
        quantityOption !== undefined &&
        'value' in quantityOption &&
        typeof quantityOption.value === 'number'
          ? quantityOption.value
          : 1;

      if (itemId === undefined) {
        throw new ShopItemUnavailableError();
      }

      const purchase = await services.shop.purchase(
        interaction.id,
        discordUserId,
        itemId,
        quantity,
      );
      const heading = purchase.replayed
        ? NOELIA_COPY.shopPurchaseReplayed
        : NOELIA_COPY.shopPurchaseComplete;
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: heading,
            description: `${purchase.quantity} × ${purchase.item.displayName} · ${formatBalance(purchase.totalPrice)}\nWallet: ${formatBalance(purchase.walletBalance)} · Owned: ${purchase.inventoryQuantity}`,
            tone: purchase.replayed ? 'signature' : 'success',
          }),
        ],
      });
      return;
    }

    throw new Error('Unsupported shop subcommand.');
  },
};
