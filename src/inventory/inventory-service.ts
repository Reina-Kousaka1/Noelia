import type { Pool, QueryResultRow } from 'pg';

import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import { ExpectedDomainError } from '../utils/expected-domain-error.js';
import { parseShopRarity } from '../shop/rarity.js';
import type { InventoryEntry, InventoryPage, InventoryPort, InventorySource } from './types.js';

const PAGE_SIZE = 10;
const MAX_PAGE = 100_000;

interface InventoryRow extends QueryResultRow {
  readonly item_id: string;
  readonly display_name: string;
  readonly category: string;
  readonly rarity: string;
  readonly quantity: number;
  readonly acquired_at: Date;
  readonly source: InventorySource;
}

interface CountRow extends QueryResultRow {
  readonly total_items: string;
}

export class InventoryPageError extends ExpectedDomainError {
  public constructor() {
    super(
      'The requested inventory page is invalid.',
      'Choose an inventory page from 1 to 100,000.',
    );
    this.name = 'InventoryPageError';
  }
}

export class InventoryService implements InventoryPort {
  public constructor(private readonly pool: Pool) {}

  public async listInventory(discordUserId: string, page: number): Promise<InventoryPage> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');

    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
      throw new InventoryPageError();
    }

    const countResult = await this.pool.query<CountRow>(
      `SELECT count(*)::text AS total_items
       FROM user_inventory
       WHERE discord_user_id = $1`,
      [discordUserId],
    );
    const totalItems = Number(countResult.rows[0]?.total_items ?? '0');

    if (!Number.isSafeInteger(totalItems)) {
      throw new Error('Inventory item count exceeded the supported range.');
    }

    const result = await this.pool.query<InventoryRow>(
      `SELECT inventory.item_id,
              item.display_name,
              item.category,
              item.rarity,
              inventory.quantity,
              inventory.acquired_at,
              inventory.source
       FROM user_inventory AS inventory
       INNER JOIN shop_catalog AS item ON item.item_id = inventory.item_id
       WHERE inventory.discord_user_id = $1
       ORDER BY inventory.acquired_at DESC, inventory.item_id
       LIMIT $2 OFFSET $3`,
      [discordUserId, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    );

    return {
      entries: result.rows.map((row) => this.toEntry(row)),
      page,
      pageSize: PAGE_SIZE,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / PAGE_SIZE)),
    };
  }

  private toEntry(row: InventoryRow): InventoryEntry {
    return {
      itemId: row.item_id,
      displayName: row.display_name,
      category: row.category,
      rarity: parseShopRarity(row.rarity),
      quantity: row.quantity,
      acquiredAt: row.acquired_at,
      source: row.source,
    };
  }
}
