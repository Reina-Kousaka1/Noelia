import type { PoolClient, QueryResultRow } from 'pg';

import type { AchievementId } from './types.js';

export type AchievementSourceType =
  | 'BALLET_ACTIVITY'
  | 'BALLET_LEVEL'
  | 'PERFORMANCE'
  | 'SHOP_PURCHASE'
  | 'WARDROBE_EQUIPPED'
  | 'MARKETPLACE_SALE'
  | 'MARKETPLACE_PURCHASE'
  | 'COLLECTION';

interface CompletedCollectionRow extends QueryResultRow {
  readonly collection_id: string;
}

export async function unlockAchievement(
  client: PoolClient,
  discordUserId: string,
  achievementId: AchievementId,
  sourceType: AchievementSourceType,
  sourceReference: string,
): Promise<void> {
  await client.query(
    `INSERT INTO user_achievements (
       discord_user_id, achievement_id, source_type, source_reference
     ) SELECT $1, catalog.achievement_id, $3, $4
       FROM achievement_catalog AS catalog
       WHERE catalog.achievement_id = $2 AND catalog.active = true
     ON CONFLICT (discord_user_id, achievement_id) DO NOTHING`,
    [discordUserId, achievementId, sourceType, sourceReference],
  );
}

export async function evaluateCollectionAchievements(
  client: PoolClient,
  discordUserId: string,
  sourceReference: string,
): Promise<void> {
  const completed = await client.query<CompletedCollectionRow>(
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
     SELECT collection.collection_id
     FROM shop_collections AS collection
     WHERE collection.active = true
       AND EXISTS (
         SELECT 1 FROM shop_item_collections AS membership
         WHERE membership.collection_id = collection.collection_id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM shop_item_collections AS membership
         WHERE membership.collection_id = collection.collection_id
           AND NOT EXISTS (
             SELECT 1 FROM owned_items AS owned
             WHERE owned.item_id = membership.item_id
           )
       )
     ORDER BY collection.collection_id`,
    [discordUserId],
  );
  if (completed.rows.length === 0) return;

  await unlockAchievement(
    client,
    discordUserId,
    'first-collection',
    'COLLECTION',
    completed.rows[0]?.collection_id ?? sourceReference,
  );
  if (completed.rows.length >= 3) {
    await unlockAchievement(
      client,
      discordUserId,
      'three-collections',
      'COLLECTION',
      sourceReference,
    );
  }
}
