import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  WardrobeItemNotOwnedError,
  WardrobeItemNotWearableError,
} from '../../src/wardrobe/errors.js';
import { WardrobeService } from '../../src/wardrobe/wardrobe-service.js';

const discordUserId = '222222222222222222';
const equippedAt = new Date('2026-10-01T12:00:00.000Z');

interface CatalogFixture {
  readonly item_id: string;
  readonly display_name: string;
  readonly cosmetic_metadata: unknown;
}

function createService(options?: {
  readonly item?: CatalogFixture;
  readonly owned?: boolean;
  readonly conflicts?: readonly { readonly item_id: string; readonly display_name: string }[];
  readonly outfit?: readonly {
    readonly item_id: string;
    readonly display_name: string;
    readonly slots: readonly string[];
    readonly equipped_at: Date;
  }[];
  readonly selectedSlot?: { readonly item_id: string; readonly display_name: string };
  readonly removedSlots?: readonly { readonly slot: string; readonly equipped_at: Date }[];
  readonly failInsert?: Error;
}) {
  const bow: CatalogFixture = {
    item_id: 'satin-ribbon-bow',
    display_name: 'Satin Ribbon Bow',
    cosmetic_metadata: { slots: ['hair_accessory'] },
  };
  const queryLog: { readonly sql: string; readonly values: unknown[] }[] = [];
  const insertedSlots: string[] = [];
  const query = vi.fn(async (rawSql: string, values: unknown[] = []) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();
    queryLog.push({ sql, values });

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO discord_users')) {
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO user_achievements')) {
      return { rows: [] };
    }
    if (sql.startsWith('SELECT discord_user_id FROM discord_users')) {
      return { rows: [{ discord_user_id: discordUserId }] };
    }
    if (sql.startsWith('SELECT quantity FROM user_inventory')) {
      return { rows: options?.owned === false ? [] : [{ quantity: 1 }] };
    }
    if (sql.startsWith('SELECT item_id, display_name, cosmetic_metadata')) {
      const item = options?.item ?? bow;
      return { rows: values[0] === item.item_id ? [item] : [] };
    }
    if (sql.includes('equipment.slot = ANY')) {
      return { rows: options?.conflicts ?? [] };
    }
    if (sql.startsWith('DELETE FROM wardrobe_equipment') && sql.includes('ANY')) {
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO wardrobe_equipment')) {
      if (options?.failInsert !== undefined) {
        throw options.failInsert;
      }
      insertedSlots.push(String(values[1]));
      return { rows: [] };
    }
    if (sql.includes('array_agg(equipment.slot')) {
      return { rows: options?.outfit ?? [] };
    }
    if (sql.includes('equipment.slot = $2')) {
      return { rows: options?.selectedSlot === undefined ? [] : [options.selectedSlot] };
    }
    if (sql.startsWith('DELETE FROM wardrobe_equipment')) {
      return { rows: options?.removedSlots ?? [] };
    }

    throw new Error(`Unexpected test SQL: ${sql}`);
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = { query, connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;

  return { service: new WardrobeService(pool), client, query, queryLog, insertedSlots };
}

describe('WardrobeService', () => {
  it('groups stored equipment into outfit items', async () => {
    const database = createService({
      outfit: [
        {
          item_id: 'satin-ribbon-bow',
          display_name: 'Satin Ribbon Bow',
          slots: ['hair_accessory'],
          equipped_at: equippedAt,
        },
      ],
    });

    await expect(database.service.getOutfit(discordUserId)).resolves.toEqual([
      {
        itemId: 'satin-ribbon-bow',
        displayName: 'Satin Ribbon Bow',
        slots: ['hair_accessory'],
        equippedAt,
      },
    ]);
  });

  it('replaces complete conflicting items when equipping a multi-slot costume', async () => {
    const database = createService({
      item: {
        item_id: 'ivory-wrap-cardigan',
        display_name: 'Ivory Wrap Cardigan',
        cosmetic_metadata: { slots: ['wrap', 'outerwear'] },
      },
      conflicts: [
        { item_id: 'old-wrap', display_name: 'Old Wrap' },
        { item_id: 'old-wrap', display_name: 'Old Wrap' },
      ],
    });

    await expect(database.service.equip(discordUserId, 'ivory-wrap-cardigan')).resolves.toEqual({
      itemId: 'ivory-wrap-cardigan',
      displayName: 'Ivory Wrap Cardigan',
      slots: ['wrap', 'outerwear'],
      displacedItems: [{ itemId: 'old-wrap', displayName: 'Old Wrap' }],
    });
    expect(database.insertedSlots).toEqual(['wrap', 'outerwear']);
    expect(
      database.queryLog.some(
        ({ sql, values }) =>
          sql.startsWith('DELETE FROM wardrobe_equipment') &&
          values[1]?.toString().includes('old-wrap'),
      ),
    ).toBe(true);
    expect(database.queryLog.at(-1)?.sql).toBe('COMMIT');
  });

  it('refuses to equip an unowned item without writing equipment', async () => {
    const database = createService({ owned: false });

    await expect(database.service.equip(discordUserId, 'satin-ribbon-bow')).rejects.toBeInstanceOf(
      WardrobeItemNotOwnedError,
    );
    expect(
      database.queryLog.some(({ sql }) => sql.startsWith('INSERT INTO wardrobe_equipment')),
    ).toBe(false);
    expect(database.queryLog.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('rejects invalid cosmetic slot metadata and rolls back partial equipment writes', async () => {
    const invalidMetadata = createService({
      item: {
        item_id: 'satin-ribbon-bow',
        display_name: 'Satin Ribbon Bow',
        cosmetic_metadata: { slots: ['unknown_slot'] },
      },
    });
    await expect(
      invalidMetadata.service.equip(discordUserId, 'satin-ribbon-bow'),
    ).rejects.toBeInstanceOf(WardrobeItemNotWearableError);

    const failure = new Error('equipment insert failed');
    const failingInsert = createService({
      item: {
        item_id: 'ivory-wrap-cardigan',
        display_name: 'Ivory Wrap Cardigan',
        cosmetic_metadata: { slots: ['wrap', 'outerwear'] },
      },
      failInsert: failure,
    });
    await expect(failingInsert.service.equip(discordUserId, 'ivory-wrap-cardigan')).rejects.toBe(
      failure,
    );
    expect(failingInsert.queryLog.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('unequips an item from all of its occupied slots', async () => {
    const database = createService({
      selectedSlot: { item_id: 'ivory-wrap-cardigan', display_name: 'Ivory Wrap Cardigan' },
      removedSlots: [
        { slot: 'outerwear', equipped_at: equippedAt },
        { slot: 'wrap', equipped_at: equippedAt },
      ],
    });

    await expect(database.service.unequip(discordUserId, 'wrap')).resolves.toEqual({
      itemId: 'ivory-wrap-cardigan',
      displayName: 'Ivory Wrap Cardigan',
      slots: ['outerwear', 'wrap'],
      equippedAt,
    });
  });
});
