import * as Eris from 'eris';

import type { SlashCommand } from '../command.js';

export const inventoryCommand: SlashCommand = {
  definition: {
    name: 'inventory',
    description: 'View your Ballet collection.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'page',
        description: 'Inventory page number (10 items per page).',
        type: Eris.Constants.ApplicationCommandOptionTypes.INTEGER,
        required: false,
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;

    if (discordUserId === undefined) {
      throw new Error('The inventory command requires a guild member context.');
    }

    const pageOption = interaction.data.options?.find((option) => option.name === 'page');
    const page =
      pageOption !== undefined && 'value' in pageOption && typeof pageOption.value === 'number'
        ? pageOption.value
        : 1;
    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);
    const inventory = await services.inventory.listInventory(discordUserId, page);
    const lines = inventory.entries.map(
      (entry) =>
        `• **${entry.displayName}** · ${entry.rarity} · ${entry.category.replaceAll('_', ' ')} · ×${entry.quantity}`,
    );
    const content =
      inventory.totalItems === 0
        ? 'Your inventory is empty. Browse `/shop` when you are ready to add your first keepsake.'
        : `Your inventory · Page ${inventory.page}/${inventory.totalPages}\n${lines.join('\n')}`;

    await interaction.createFollowup({ content });
  },
};
