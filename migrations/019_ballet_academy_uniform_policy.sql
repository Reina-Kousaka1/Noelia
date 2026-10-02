UPDATE shop_catalog AS item
SET cosmetic_metadata = jsonb_set(
  item.cosmetic_metadata,
  '{academy_uniform_roles}',
  to_jsonb(tags.roles::text[]),
  true
)
FROM (VALUES
  ('soft-pink-leotard', ARRAY['academy-leotard']),
  ('first-class-leotard', ARRAY['academy-leotard']),
  ('sunday-cotton-leotard', ARRAY['academy-leotard']),
  ('cloud-soft-tights', ARRAY['academy-tights']),
  ('cream-studio-tights', ARRAY['academy-tights']),
  ('classic-ballet-flats', ARRAY['academy-flat']),
  ('soft-step-canvas-flats', ARRAY['academy-flat']),
  ('rose-tie-warmup-wrap', ARRAY['academy-apprentice-accent']),
  ('lacework-academy-skirt', ARRAY['academy-repertoire-accent']),
  ('crescent-tulle-skirt', ARRAY['academy-soloist-accent']),
  ('prima-satin-performance-skirt', ARRAY['academy-principal-accent']),
  ('pearl-pointe-shoes', ARRAY['academy-pointe']),
  ('moonlit-pointe-shoes', ARRAY['academy-pointe']),
  ('prima-evening-pointe-shoes', ARRAY['academy-pointe'])
) AS tags(item_id, roles)
WHERE item.item_id = tags.item_id;

-- Reuse the existing First Position collection to make the permanent starter
-- uniform discoverable alongside its other entry-level studio pieces.
INSERT INTO shop_item_collections (item_id, collection_id)
VALUES
  ('sunday-cotton-leotard', 'first-position'),
  ('classic-ballet-flats', 'first-position'),
  ('soft-step-canvas-flats', 'first-position'),
  ('cloud-soft-tights', 'first-position'),
  ('cream-studio-tights', 'first-position')
ON CONFLICT (item_id, collection_id) DO NOTHING;
