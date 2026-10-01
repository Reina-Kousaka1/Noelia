import * as Eris from 'eris';

import { SHOP_ITEM_CHOICES } from '../../shop/item-choices.js';
import { WARDROBE_SLOTS } from '../../wardrobe/types.js';
import type { WardrobeSlot } from '../../wardrobe/types.js';
import type { SlashCommand } from '../command.js';
import { createNoeliaEmbed } from '../../ui/embed.js';
import { NOELIA_COPY } from '../../persona/copy.js';

const slotChoices = WARDROBE_SLOTS.map((slot) => ({
  name: slot
    .split('_')
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' '),
  value: slot,
}));

export const wardrobeCommand: SlashCommand = {
  definition: {
    name: 'wardrobe',
    description: 'Style your owned Ballet collection.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'view',
        description: 'See your current outfit.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'equip',
        description: 'Equip an item you own.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'item',
            description: 'Choose an owned item.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
            choices: SHOP_ITEM_CHOICES,
          },
        ],
      },
      {
        name: 'unequip',
        description: 'Remove the item in a wardrobe slot.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'slot',
            description: 'Choose a wardrobe slot.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
            choices: slotChoices,
          },
        ],
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;

    if (discordUserId === undefined) {
      throw new Error('The wardrobe command requires a guild member context.');
    }

    const subcommand = interaction.data.options?.[0];

    if (subcommand === undefined) {
      throw new Error('The wardrobe command requires a subcommand.');
    }

    const options = 'options' in subcommand ? subcommand.options : undefined;
    const readString = (name: string): string | undefined => {
      const option = options?.find((candidate) => candidate.name === name);
      return option !== undefined && 'value' in option && typeof option.value === 'string'
        ? option.value
        : undefined;
    };
    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);

    if (subcommand.name === 'view') {
      const outfit = await services.wardrobe.getOutfit(discordUserId);
      const lines = outfit.map(
        (entry) =>
          `• **${entry.displayName}** — ${entry.slots.map((slot) => slot.replaceAll('_', ' ')).join(', ')}`,
      );
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.wardrobeTitle,
            description:
              lines.length === 0
                ? NOELIA_COPY.wardrobeEmpty
                : `Current outfit\n${lines.join('\n')}`,
          }),
        ],
      });
      return;
    }

    if (subcommand.name === 'equip') {
      const itemId = readString('item');

      if (itemId === undefined) {
        throw new Error('The wardrobe item option is missing.');
      }

      const result = await services.wardrobe.equip(discordUserId, itemId);
      const displaced =
        result.displacedItems.length === 0
          ? ''
          : ` Replaced: ${result.displacedItems.map((item) => item.displayName).join(', ')}.`;
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.wardrobeTitle,
            description: `**${result.displayName}** is now equipped in ${result.slots.map((slot) => slot.replaceAll('_', ' ')).join(', ')}.${displaced}`,
            tone: 'success',
          }),
        ],
      });
      return;
    }

    if (subcommand.name === 'unequip') {
      const slot = readString('slot');

      if (slot === undefined) {
        throw new Error('The wardrobe slot option is missing.');
      }

      const item = await services.wardrobe.unequip(discordUserId, slot as WardrobeSlot);
      await interaction.createFollowup({
        embeds: [
          createNoeliaEmbed({
            title: NOELIA_COPY.wardrobeTitle,
            description:
              item === undefined
                ? `There is nothing equipped in ${slot.replaceAll('_', ' ')}.`
                : `Removed **${item.displayName}** from ${item.slots.map((itemSlot) => itemSlot.replaceAll('_', ' ')).join(', ')}.`,
            tone: item === undefined ? 'signature' : 'success',
          }),
        ],
      });
      return;
    }

    throw new Error('Unsupported wardrobe subcommand.');
  },
};
