INSERT INTO shop_item_collections (item_id, collection_id)
VALUES
  ('academy-hand-me-down-leotard', 'first-position'),
  ('academy-hand-me-down-tights', 'first-position'),
  ('academy-hand-me-down-flats', 'first-position')
ON CONFLICT (item_id, collection_id) DO NOTHING;
