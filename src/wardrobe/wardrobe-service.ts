import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../database/transaction.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import {
  WardrobeItemNotOwnedError,
  WardrobeItemNotWearableError,
  WardrobeSlotError,
} from './errors.js';
import { WARDROBE_SLOTS } from './types.js';
import type {
  WardrobeEquipResult,
  WardrobeOutfitItem,
  WardrobePort,
  WardrobeSlot,
} from './types.js';

const itemIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface UserRow extends QueryResultRow {
  readonly discord_user_id: string;
}

interface OutfitRow extends QueryResultRow {
  readonly item_id: string;
  readonly display_name: string;
  readonly slots: WardrobeSlot[];
  readonly equipped_at: Date;
}

interface OwnedRow extends QueryResultRow {
  readonly quantity: number;
}

interface CatalogRow extends QueryResultRow {
  readonly item_id: string;
  readonly display_name: string;
  readonly cosmetic_metadata: unknown;
}

interface ConflictingEquipmentRow extends QueryResultRow {
  readonly item_id: string;
  readonly display_name: string;
}

interface SlotRow extends QueryResultRow {
  readonly item_id: string;
  readonly display_name: string;
}

interface DeletedEquipmentRow extends QueryResultRow {
  readonly slot: WardrobeSlot;
  readonly equipped_at: Date;
}

export class WardrobeService implements WardrobePort {
  public constructor(private readonly pool: Pool) {}

  public async getOutfit(discordUserId: string): Promise<readonly WardrobeOutfitItem[]> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<OutfitRow>(
      `SELECT item.item_id,
              item.display_name,
              array_agg(equipment.slot ORDER BY equipment.slot) AS slots,
              min(equipment.equipped_at) AS equipped_at
       FROM wardrobe_equipment AS equipment
       INNER JOIN shop_catalog AS item ON item.item_id = equipment.item_id
       WHERE equipment.discord_user_id = $1
       GROUP BY item.item_id, item.display_name
       ORDER BY min(equipment.equipped_at), item.display_name`,
      [discordUserId],
    );

    return result.rows.map((row) => this.toOutfitItem(row));
  }

  public async equip(discordUserId: string, itemId: string): Promise<WardrobeEquipResult> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');

    if (!itemIdPattern.test(itemId)) {
      throw new WardrobeItemNotWearableError();
    }

    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUser(client, discordUserId);
      const ownedResult = await client.query<OwnedRow>(
        `SELECT quantity
         FROM user_inventory
         WHERE discord_user_id = $1 AND item_id = $2
         FOR UPDATE`,
        [discordUserId, itemId],
      );

      if (ownedResult.rows[0] === undefined) {
        throw new WardrobeItemNotOwnedError();
      }

      const catalogResult = await client.query<CatalogRow>(
        `SELECT item_id, display_name, cosmetic_metadata
         FROM shop_catalog
         WHERE item_id = $1
         FOR SHARE`,
        [itemId],
      );
      const catalogItem = catalogResult.rows[0];

      if (catalogItem === undefined) {
        throw new WardrobeItemNotWearableError();
      }

      const slots = readWearableSlots(catalogItem.cosmetic_metadata);

      if (slots.length === 0) {
        throw new WardrobeItemNotWearableError();
      }

      const conflictsResult = await client.query<ConflictingEquipmentRow>(
        `SELECT item.item_id, item.display_name
         FROM wardrobe_equipment AS equipment
         INNER JOIN shop_catalog AS item ON item.item_id = equipment.item_id
         WHERE equipment.discord_user_id = $1 AND equipment.slot = ANY($2::text[])
         FOR UPDATE OF equipment`,
        [discordUserId, slots],
      );
      const conflicts = new Map(conflictsResult.rows.map((row) => [row.item_id, row.display_name]));

      if (conflicts.size > 0) {
        await client.query(
          `DELETE FROM wardrobe_equipment
           WHERE discord_user_id = $1 AND item_id = ANY($2::text[])`,
          [discordUserId, [...conflicts.keys()]],
        );
      }

      for (const slot of slots) {
        await client.query(
          `INSERT INTO wardrobe_equipment (discord_user_id, slot, item_id)
           VALUES ($1, $2, $3)`,
          [discordUserId, slot, itemId],
        );
      }

      return {
        itemId,
        displayName: catalogItem.display_name,
        slots,
        displacedItems: [...conflicts].map(([conflictItemId, displayName]) => ({
          itemId: conflictItemId,
          displayName,
        })),
      };
    });
  }

  public async unequip(
    discordUserId: string,
    slot: WardrobeSlot,
  ): Promise<WardrobeOutfitItem | undefined> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');

    if (!(WARDROBE_SLOTS as readonly string[]).includes(slot)) {
      throw new WardrobeSlotError();
    }

    return withTransaction(this.pool, async (client) => {
      await this.ensureAndLockUser(client, discordUserId);
      const selectedResult = await client.query<SlotRow>(
        `SELECT item.item_id, item.display_name
         FROM wardrobe_equipment AS equipment
         INNER JOIN shop_catalog AS item ON item.item_id = equipment.item_id
         WHERE equipment.discord_user_id = $1 AND equipment.slot = $2
         FOR UPDATE OF equipment`,
        [discordUserId, slot],
      );
      const selected = selectedResult.rows[0];

      if (selected === undefined) {
        return undefined;
      }

      const equipmentResult = await client.query<DeletedEquipmentRow>(
        `DELETE FROM wardrobe_equipment AS equipment
         WHERE equipment.discord_user_id = $1 AND equipment.item_id = $2
         RETURNING equipment.slot, equipment.equipped_at`,
        [discordUserId, selected.item_id],
      );
      const removedSlots = equipmentResult.rows;
      const firstRemovedSlot = removedSlots[0];

      if (firstRemovedSlot === undefined) {
        throw new Error('The selected wardrobe item could not be removed.');
      }

      return {
        itemId: selected.item_id,
        displayName: selected.display_name,
        slots: removedSlots.map((row) => row.slot),
        equippedAt: firstRemovedSlot.equipped_at,
      };
    });
  }

  private async ensureAndLockUser(client: PoolClient, discordUserId: string): Promise<void> {
    await client.query(
      `INSERT INTO discord_users (discord_user_id)
       VALUES ($1)
       ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
    const result = await client.query<UserRow>(
      `SELECT discord_user_id
       FROM discord_users
       WHERE discord_user_id = $1
       FOR UPDATE`,
      [discordUserId],
    );

    if (result.rows[0] === undefined) {
      throw new Error('Discord user row could not be locked for a wardrobe change.');
    }
  }

  private toOutfitItem(row: OutfitRow): WardrobeOutfitItem {
    return {
      itemId: row.item_id,
      displayName: row.display_name,
      slots: row.slots,
      equippedAt: row.equipped_at,
    };
  }
}

function readWearableSlots(metadata: unknown): readonly WardrobeSlot[] {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }

  const slots = (metadata as Record<string, unknown>).slots;

  if (!Array.isArray(slots) || slots.length === 0) {
    return [];
  }

  const uniqueSlots = new Set<WardrobeSlot>();

  for (const candidate of slots) {
    if (
      typeof candidate !== 'string' ||
      !(WARDROBE_SLOTS as readonly string[]).includes(candidate)
    ) {
      return [];
    }
    uniqueSlots.add(candidate as WardrobeSlot);
  }

  return [...uniqueSlots];
}
