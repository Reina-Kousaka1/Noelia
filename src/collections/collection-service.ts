import type { Pool, QueryResultRow } from 'pg';

import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import type { CollectionPort, CollectionProgress } from './types.js';

interface CollectionRow extends QueryResultRow {
  readonly collection_id: string;
  readonly display_name: string;
  readonly description: string;
  readonly owned_items: number;
  readonly total_items: number;
}

export class CollectionService implements CollectionPort {
  public constructor(private readonly pool: Pool) {}

  public async listProgress(discordUserId: string): Promise<readonly CollectionProgress[]> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<CollectionRow>(
      `WITH owned_items AS (
         SELECT inventory.item_id
         FROM user_inventory AS inventory
         WHERE inventory.discord_user_id = $1 AND inventory.quantity > 0
         UNION
         SELECT escrow.item_id
         FROM marketplace_escrow AS escrow
         INNER JOIN marketplace_listings AS listing
           ON listing.listing_id = escrow.listing_id
         WHERE escrow.seller_user_id = $1 AND listing.status = 'ACTIVE'
       )
       SELECT collection.collection_id,
              collection.display_name,
              collection.description,
              count(DISTINCT membership.item_id)::integer AS total_items,
              count(DISTINCT owned.item_id)::integer AS owned_items
       FROM shop_collections AS collection
       LEFT JOIN shop_item_collections AS membership
         ON membership.collection_id = collection.collection_id
       LEFT JOIN owned_items AS owned
         ON owned.item_id = membership.item_id
       WHERE collection.active = true
       GROUP BY collection.collection_id, collection.display_name, collection.description
       ORDER BY collection.display_name`,
      [discordUserId],
    );

    return result.rows.map((row) => ({
      collectionId: row.collection_id,
      displayName: row.display_name,
      description: row.description,
      ownedItems: row.owned_items,
      totalItems: row.total_items,
      complete: row.total_items > 0 && row.owned_items === row.total_items,
    }));
  }
}
