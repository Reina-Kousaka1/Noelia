INSERT INTO shop_item_collections (item_id, collection_id)
SELECT item.item_id, collection.collection_id
FROM shop_catalog AS item
INNER JOIN shop_collections AS collection
  ON collection.display_name = item.collection
WHERE item.collection IS NOT NULL
ON CONFLICT (item_id, collection_id) DO NOTHING;
