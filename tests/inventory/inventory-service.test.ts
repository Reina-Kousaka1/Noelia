import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { InventoryPageError, InventoryService } from '../../src/inventory/inventory-service.js';

const discordUserId = '222222222222222222';
const acquiredAt = new Date('2026-10-01T12:00:00.000Z');

function createService(totalItems = '1') {
  const query = vi.fn(async (rawSql: string) => {
    const sql = rawSql.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('SELECT count(*)')) {
      return { rows: [{ total_items: totalItems }] };
    }

    if (sql.includes('FROM user_inventory AS inventory')) {
      return {
        rows: [
          {
            item_id: 'satin-ribbon-bow',
            display_name: 'Satin Ribbon Bow',
            category: 'hair_accessory',
            rarity: 'common',
            quantity: 2,
            acquired_at: acquiredAt,
            source: 'SHOP_PURCHASE',
          },
        ],
      };
    }

    throw new Error(`Unexpected test SQL: ${sql}`);
  });
  const service = new InventoryService({ query } as unknown as Pool);

  return { service, query };
}

describe('InventoryService', () => {
  it('returns a stable page of owned inventory entries', async () => {
    const database = createService('12');

    await expect(database.service.listInventory(discordUserId, 2)).resolves.toEqual({
      entries: [
        {
          itemId: 'satin-ribbon-bow',
          displayName: 'Satin Ribbon Bow',
          category: 'hair_accessory',
          rarity: 'common',
          quantity: 2,
          acquiredAt,
          source: 'SHOP_PURCHASE',
        },
      ],
      page: 2,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
    });
    expect(database.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('LIMIT $2 OFFSET $3'),
      [discordUserId, 10, 10],
    );
  });

  it('keeps an empty inventory page at one page and rejects invalid page numbers', async () => {
    const database = createService('0');

    await expect(database.service.listInventory(discordUserId, 1)).resolves.toMatchObject({
      entries: expect.any(Array),
      totalItems: 0,
      totalPages: 1,
    });
    await expect(database.service.listInventory(discordUserId, 0)).rejects.toBeInstanceOf(
      InventoryPageError,
    );
    expect(database.query).toHaveBeenCalledTimes(2);
  });
});
