import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { wardrobeCommand } from '../../src/commands/wardrobe/wardrobe.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';

function createInteraction(options: Eris.InteractionDataOptions[]) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const createFollowup = vi.fn().mockResolvedValue(undefined);
  const interaction = {
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
  };
}

describe('wardrobe command', () => {
  it('defines view, equip, and unequip subcommands', () => {
    expect(wardrobeCommand.definition.options?.map((option) => option.name)).toEqual([
      'view',
      'equip',
      'unequip',
    ]);
    const equip = wardrobeCommand.definition.options?.find((option) => option.name === 'equip');
    if (equip?.type === Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND) {
      expect(equip.options?.[0]).not.toHaveProperty('choices');
    } else {
      throw new Error('The equip command must be a slash subcommand.');
    }
  });

  it('shows the current outfit privately', async () => {
    const { interaction, createFollowup } = createInteraction([
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

    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.wardrobeTitle,
          description: 'Current outfit\n• **Satin Ribbon Bow** — hair accessory',
        }),
      ],
    });
  });

  it('equips an owned item and clearly names replaced items', async () => {
    const { interaction, createFollowup } = createInteraction([
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
    expect(createFollowup).toHaveBeenCalledWith({
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
    const { interaction, createFollowup } = createInteraction([
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
    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.wardrobeTitle,
          description: 'Removed **Ivory Wrap Cardigan** from outerwear, wrap.',
        }),
      ],
    });
  });
});
