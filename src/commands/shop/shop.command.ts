import * as Eris from 'eris';

import { ShopItemUnavailableError } from '../../shop/errors.js';
import { SHOP_ITEM_CHOICES } from '../../shop/item-choices.js';
import { SHOP_CATEGORIES } from '../../shop/types.js';
import type { ShopCategory } from '../../shop/types.js';
import type { SlashCommand } from '../command.js';
import { formatBalance } from '../balance/format-balance.js';

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
        ],
      },
      {
        name: 'item',
        description: 'See details for a shop item.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'item',
            description: 'Choose an item.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
            choices: SHOP_ITEM_CHOICES,
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
            description: 'Choose an item.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
            choices: SHOP_ITEM_CHOICES,
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
    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);

    if (subcommand.name === 'browse') {
      const category = readStringOption('category');
      const items = await services.shop.listItems(category as ShopCategory | undefined);
      const lines = items.map(
        (item) =>
          `• **${item.displayName}** — ${item.category.replaceAll('_', ' ')} · ${item.rarity} · ${formatBalance(item.price)}${item.minimumBalletLevel === null ? '' : ` · Ballet level ${item.minimumBalletLevel}+`}`,
      );
      await interaction.createFollowup({
        content:
          lines.length === 0
            ? 'The collection has no items in that category yet.'
            : lines.join('\n'),
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
        content: `**${item.displayName}** · ${item.rarity}\n${item.description}\nPrice: ${formatBalance(item.price)}.${requirement}${purchaseState}`,
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
      const heading = purchase.replayed ? 'Purchase already recorded' : 'Purchase complete';
      await interaction.createFollowup({
        content: `${heading}: ${purchase.quantity} × ${purchase.item.displayName} for ${formatBalance(purchase.totalPrice)}. Wallet: ${formatBalance(purchase.walletBalance)}. You own ${purchase.inventoryQuantity}.`,
      });
      return;
    }

    throw new Error('Unsupported shop subcommand.');
  },
};
