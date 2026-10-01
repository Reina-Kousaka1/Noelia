import * as Eris from 'eris';

import { WARDROBE_SLOTS } from '../../wardrobe/types.js';
import type { WardrobeSlot } from '../../wardrobe/types.js';
import type { SlashCommand } from '../command.js';
import { NOELIA_COPY } from '../../persona/copy.js';
import { createPersonaEmbedRenderer } from '../../persona/presentation.js';

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
            description: 'Enter a stable item ID shown by /inventory.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
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
      {
        name: 'clear',
        description: 'Remove every item from your current outfit.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'presets',
        description: 'Create, save, apply, rename, and delete outfit presets.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND_GROUP,
        options: [
          {
            name: 'list',
            description: 'List your saved outfit presets.',
            type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
          },
          {
            name: 'create',
            description: 'Save your current outfit as a new preset.',
            type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
            options: [
              {
                name: 'name',
                description: 'Preset name (1–32 characters).',
                type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                required: true,
              },
            ],
          },
          {
            name: 'save',
            description: 'Replace a preset with your current outfit.',
            type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
            options: [
              {
                name: 'preset',
                description: 'Preset ID shown by /wardrobe presets list.',
                type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                required: true,
              },
            ],
          },
          {
            name: 'apply',
            description: 'Wear a saved outfit preset.',
            type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
            options: [
              {
                name: 'preset',
                description: 'Preset ID shown by /wardrobe presets list.',
                type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                required: true,
              },
            ],
          },
          {
            name: 'rename',
            description: 'Rename one of your presets.',
            type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
            options: [
              {
                name: 'preset',
                description: 'Preset ID shown by /wardrobe presets list.',
                type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                required: true,
              },
              {
                name: 'name',
                description: 'New preset name (1–32 characters).',
                type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                required: true,
              },
            ],
          },
          {
            name: 'delete',
            description: 'Delete one of your saved presets.',
            type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
            options: [
              {
                name: 'preset',
                description: 'Preset ID shown by /wardrobe presets list.',
                type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                required: true,
              },
            ],
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

    const personaEmbed = createPersonaEmbedRenderer(services.persona, 'wardrobe', discordUserId);

    const subcommand = interaction.data.options?.[0];

    if (subcommand === undefined) {
      throw new Error('The wardrobe command requires a subcommand.');
    }

    const action =
      subcommand.type === Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND_GROUP
        ? subcommand.options?.[0]
        : subcommand;
    if (action === undefined) throw new Error('The wardrobe preset group requires an action.');
    const options = 'options' in action ? action.options : undefined;
    const readString = (name: string): string | undefined => {
      const option = options?.find((candidate) => candidate.name === name);
      return option !== undefined && 'value' in option && typeof option.value === 'string'
        ? option.value
        : undefined;
    };
    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);

    if (action.name === 'view') {
      const outfit = await services.wardrobe.getOutfit(discordUserId);
      const lines = outfit.map(
        (entry) =>
          `• **${entry.displayName}** — ${entry.slots.map((slot) => slot.replaceAll('_', ' ')).join(', ')}`,
      );
      await interaction.createFollowup({
        embeds: [
          await personaEmbed(
            'outfit_view',
            { equipped_item_count: outfit.length },
            {
              title: NOELIA_COPY.wardrobeTitle,
              description:
                lines.length === 0
                  ? NOELIA_COPY.wardrobeEmpty
                  : `Current outfit\n${lines.join('\n')}`,
            },
          ),
        ],
      });
      return;
    }

    if (action.name === 'equip') {
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
          await personaEmbed(
            'item_equipped',
            {
              slot_count: result.slots.length,
              displaced_item_count: result.displacedItems.length,
            },
            {
              title: NOELIA_COPY.wardrobeTitle,
              description: `**${result.displayName}** is now equipped in ${result.slots.map((slot) => slot.replaceAll('_', ' ')).join(', ')}.${displaced}`,
              tone: 'success',
            },
          ),
        ],
      });
      return;
    }

    if (action.name === 'unequip') {
      const slot = readString('slot');

      if (slot === undefined) {
        throw new Error('The wardrobe slot option is missing.');
      }

      const item = await services.wardrobe.unequip(discordUserId, slot as WardrobeSlot);
      await interaction.createFollowup({
        embeds: [
          await personaEmbed(
            item === undefined ? 'slot_already_empty' : 'item_unequipped',
            {
              slot: slot.replaceAll('-', '_'),
              removed: item !== undefined,
            },
            {
              title: NOELIA_COPY.wardrobeTitle,
              description:
                item === undefined
                  ? `There is nothing equipped in ${slot.replaceAll('_', ' ')}.`
                  : `Removed **${item.displayName}** from ${item.slots.map((itemSlot) => itemSlot.replaceAll('_', ' ')).join(', ')}.`,
              tone: item === undefined ? 'signature' : 'success',
            },
          ),
        ],
      });
      return;
    }

    if (action.name === 'clear') {
      const presets = services.wardrobePresets;
      if (presets === undefined) throw new Error('The wardrobe preset service is not configured.');
      const result = await presets.clear(interaction.id, discordUserId);
      await interaction.createFollowup({
        embeds: [
          await personaEmbed(
            result.replayed ? 'outfit_clear_replayed' : 'outfit_cleared',
            {
              removed_item_count: result.removedItemCount,
              replayed: result.replayed,
            },
            {
              title: NOELIA_COPY.wardrobeCleared,
              description: result.replayed
                ? NOELIA_COPY.wardrobeClearReplay
                : NOELIA_COPY.wardrobeClearRemoved(result.removedItemCount),
              tone: result.replayed ? 'signature' : 'success',
            },
          ),
        ],
      });
      return;
    }

    if (subcommand.name === 'presets') {
      const presets = services.wardrobePresets;
      if (presets === undefined) throw new Error('The wardrobe preset service is not configured.');

      if (action.name === 'list') {
        const saved = await presets.listPresets(discordUserId);
        const lines = saved.map((preset) =>
          NOELIA_COPY.wardrobePresetListEntry(preset.presetId, preset.name, preset.itemCount),
        );
        await interaction.createFollowup({
          embeds: [
            await personaEmbed(
              'presets_list',
              { preset_count: saved.length },
              {
                title: NOELIA_COPY.wardrobePresetsTitle,
                description:
                  lines.length === 0 ? NOELIA_COPY.wardrobePresetsEmpty : lines.join('\n'),
              },
            ),
          ],
        });
        return;
      }

      if (action.name === 'create') {
        const name = readString('name');
        if (name === undefined) throw new Error('The wardrobe preset name is missing.');
        const result = await presets.createPreset(interaction.id, discordUserId, name);
        await interaction.createFollowup({
          embeds: [
            await personaEmbed(
              result.replayed ? 'preset_create_replayed' : 'preset_created',
              {
                item_count: result.itemCount,
                replayed: result.replayed,
              },
              {
                title: NOELIA_COPY.wardrobePresetSaved,
                description: NOELIA_COPY.wardrobePresetSummary(
                  result.presetId,
                  result.name,
                  result.itemCount,
                  result.replayed,
                ),
                tone: result.replayed ? 'signature' : 'success',
              },
            ),
          ],
        });
        return;
      }

      const presetId = readString('preset');
      if (presetId === undefined) throw new Error('The wardrobe preset ID is missing.');

      if (action.name === 'save') {
        const result = await presets.savePreset(interaction.id, discordUserId, presetId);
        await interaction.createFollowup({
          embeds: [
            await personaEmbed(
              result.replayed ? 'preset_save_replayed' : 'preset_saved',
              {
                item_count: result.itemCount,
                replayed: result.replayed,
              },
              {
                title: NOELIA_COPY.wardrobePresetSaved,
                description: NOELIA_COPY.wardrobePresetSummary(
                  result.presetId,
                  result.name,
                  result.itemCount,
                  result.replayed,
                ),
                tone: result.replayed ? 'signature' : 'success',
              },
            ),
          ],
        });
        return;
      }

      if (action.name === 'apply') {
        const result = await presets.applyPreset(interaction.id, discordUserId, presetId);
        const items = result.outfit.map((item) => item.displayName).join(', ');
        await interaction.createFollowup({
          embeds: [
            await personaEmbed(
              result.replayed ? 'preset_apply_replayed' : 'preset_applied',
              {
                equipped_item_count: result.outfit.length,
                replayed: result.replayed,
              },
              {
                title: NOELIA_COPY.wardrobePresetApplied,
                description: NOELIA_COPY.wardrobePresetAppliedSummary(
                  result.presetId,
                  result.name,
                  items,
                  result.replayed,
                ),
                tone: result.replayed ? 'signature' : 'success',
              },
            ),
          ],
        });
        return;
      }

      if (action.name === 'rename') {
        const name = readString('name');
        if (name === undefined) throw new Error('The new wardrobe preset name is missing.');
        const result = await presets.renamePreset(interaction.id, discordUserId, presetId, name);
        await interaction.createFollowup({
          embeds: [
            await personaEmbed(
              result.replayed ? 'preset_rename_replayed' : 'preset_renamed',
              {
                updated: true,
                replayed: result.replayed,
              },
              {
                title: NOELIA_COPY.wardrobePresetRenamed,
                description: NOELIA_COPY.wardrobePresetRenameSummary(result.presetId, result.name),
                tone: result.replayed ? 'signature' : 'success',
              },
            ),
          ],
        });
        return;
      }

      if (action.name === 'delete') {
        const result = await presets.deletePreset(interaction.id, discordUserId, presetId);
        await interaction.createFollowup({
          embeds: [
            await personaEmbed(
              'preset_deleted',
              { deleted: true },
              {
                title: NOELIA_COPY.wardrobePresetDeleted,
                description: NOELIA_COPY.wardrobePresetDeleteSummary(result.presetId, result.name),
                tone: 'success',
              },
            ),
          ],
        });
        return;
      }
    }

    throw new Error('Unsupported wardrobe subcommand.');
  },
};
