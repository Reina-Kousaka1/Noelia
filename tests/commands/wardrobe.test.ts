import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { wardrobeCommand } from '../../src/commands/wardrobe/wardrobe.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';

function createInteraction(options: Eris.InteractionDataOptions[]) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: '111111111111111111',
    member: { id: '222222222222222222' },
    data: { options },
    acknowledged: true,

    defer,
    editOriginalMessage,
  } as unknown as Eris.CommandInteraction;

  return { interaction, defer, editOriginalMessage };
}

function createServices() {
  return {
    economy: { getBalance: vi.fn() },
    daily: { claimDaily: vi.fn() },
    ballet: { getProgress: vi.fn(), listActivities: vi.fn(), practice: vi.fn() },
    shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
    inventory: { listInventory: vi.fn() },
    wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
    wardrobePresets: {
      clear: vi.fn(),
      listPresets: vi.fn(),
      createPreset: vi.fn(),
      savePreset: vi.fn(),
      applyPreset: vi.fn(),
      renamePreset: vi.fn(),
      deletePreset: vi.fn(),
    },
    profile: { getProfile: vi.fn() },
  };
}

describe('wardrobe command', () => {
  it('defines outfit clearing and a grouped outfit preset flow', () => {
    expect(wardrobeCommand.definition.options?.map((option) => option.name)).toEqual([
      'view',
      'equip',
      'unequip',
      'clear',
      'presets',
    ]);
    const equip = wardrobeCommand.definition.options?.find((option) => option.name === 'equip');
    if (equip?.type === Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND) {
      expect(equip.options?.[0]).not.toHaveProperty('choices');
    } else {
      throw new Error('The equip command must be a slash subcommand.');
    }

    const presets = wardrobeCommand.definition.options?.find((option) => option.name === 'presets');
    if (presets?.type === Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND_GROUP) {
      expect(presets.options?.map((option) => option.name)).toEqual([
        'list',
        'create',
        'save',
        'apply',
        'rename',
        'delete',
      ]);
    } else {
      throw new Error('Presets must be a grouped slash command.');
    }
  });

  it('shows the current outfit publicly', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'view',
      },
    ]);
    const services = createServices();
    services.wardrobe.getOutfit.mockResolvedValue([
      {
        itemId: 'satin-ribbon-bow',
        displayName: 'Satin Ribbon Bow',
        slots: ['hair_accessory'],
        equippedAt: new Date('2026-10-01T12:00:00.000Z'),
      },
    ]);

    await wardrobeCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.wardrobeTitle,
          description: 'Current outfit\n• **Satin Ribbon Bow** — hair accessory',
        }),
      ],
    });
  });

  it('equips an owned item and clearly names replaced items', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'equip',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'item',
            value: 'ivory-wrap-cardigan',
          },
        ],
      },
    ]);
    const services = createServices();
    services.wardrobe.equip.mockResolvedValue({
      itemId: 'ivory-wrap-cardigan',
      displayName: 'Ivory Wrap Cardigan',
      slots: ['wrap', 'outerwear'],
      displacedItems: [{ itemId: 'old-wrap', displayName: 'Old Wrap' }],
    });

    await wardrobeCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.wardrobe.equip).toHaveBeenCalledWith(
      '222222222222222222',
      'ivory-wrap-cardigan',
    );
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.wardrobeTitle,
          description:
            '**Ivory Wrap Cardigan** is now equipped in wrap, outerwear. Replaced: Old Wrap.',
        }),
      ],
    });
  });

  it('unequips the whole outfit item from its multiple slots', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'unequip',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'slot',
            value: 'wrap',
          },
        ],
      },
    ]);
    const services = createServices();
    services.wardrobe.unequip.mockResolvedValue({
      itemId: 'ivory-wrap-cardigan',
      displayName: 'Ivory Wrap Cardigan',
      slots: ['outerwear', 'wrap'],
      equippedAt: new Date('2026-10-01T12:00:00.000Z'),
    });

    await wardrobeCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.wardrobe.unequip).toHaveBeenCalledWith('222222222222222222', 'wrap');
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.wardrobeTitle,
          description: 'Removed **Ivory Wrap Cardigan** from outerwear, wrap.',
        }),
      ],
    });
  });

  it('clears the current outfit with the interaction ID as its idempotency key', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'clear',
      },
    ]);
    const services = createServices();
    services.wardrobePresets.clear.mockResolvedValue({ removedItemCount: 2, replayed: false });

    await wardrobeCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.wardrobePresets.clear).toHaveBeenCalledWith(
      '111111111111111111',
      '222222222222222222',
    );
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.wardrobeCleared,
          description: 'Removed 2 equipped pieces.',
        }),
      ],
    });
  });

  it('routes nested preset create interactions into the preset domain', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND_GROUP,
        name: 'presets',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
            name: 'create',
            options: [
              {
                type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                name: 'name',
                value: 'Training',
              },
            ],
          },
        ],
      },
    ]);
    const services = createServices();
    services.wardrobePresets.createPreset.mockResolvedValue({
      presetId: '7',
      name: 'Training',
      itemCount: 2,
      replayed: false,
    });

    await wardrobeCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.wardrobePresets.createPreset).toHaveBeenCalledWith(
      '111111111111111111',
      '222222222222222222',
      'Training',
    );
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.wardrobePresetSaved,
          description: expect.stringContaining('#7 **Training**'),
        }),
      ],
    });
  });
});
