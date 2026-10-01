ALTER TABLE shop_catalog
  DROP CONSTRAINT shop_catalog_category_check;

ALTER TABLE shop_catalog
  ADD CONSTRAINT shop_catalog_category_check CHECK (category IN (
    'leotard', 'skirt', 'wrap_top', 'outerwear', 'legwear', 'tights',
    'ballet_flats', 'beauty', 'pointe_shoes', 'bag', 'hair_accessory', 'jewelry',
    'accessory', 'studio_item', 'collectible', 'seasonal', 'event_item'
  ));

INSERT INTO shop_catalog (
  item_id, display_name, description, category, rarity, price, stackable,
  minimum_ballet_level, collection, cosmetic_metadata
) VALUES
  ('first-position-wrap-skirt', 'First Position Wrap Skirt', 'A clean practice wrap with a softly curved hem and secure ties.', 'skirt', 'common', 125, false, 1, 'First Position', '{"color":"ballet-pink","slots":["skirt"],"fabric":"light-chiffon"}'),
  ('first-class-leotard', 'First Class Leotard', 'A simple, comfortable leotard with a neat studio neckline.', 'leotard', 'common', 160, false, 1, 'First Position', '{"color":"soft-pink","slots":["leotard"],"silhouette":"classical"}'),
  ('little-studio-bow', 'Little Studio Bow', 'A petite satin bow that sits neatly above a rehearsal bun.', 'hair_accessory', 'common', 75, false, 1, 'First Position', '{"color":"blush","slots":["hair_accessory"],"finish":"satin"}'),

  ('blush-rehearsal-cardigan', 'Blush Rehearsal Cardigan', 'A cropped knit layer with pearl-look buttons for cool run-throughs.', 'outerwear', 'uncommon', 340, false, 5, 'Blush Rehearsal', '{"color":"blush","slots":["outerwear"],"detail":"pearl-look-buttons"}'),
  ('blush-crossback-wrap', 'Blush Crossback Wrap', 'A soft wrap top with a tidy crossback and long ballet ties.', 'wrap_top', 'uncommon', 270, false, 4, 'Blush Rehearsal', '{"color":"ballet-pink","slots":["wrap"],"fabric":"fine-knit"}'),
  ('rehearsal-rib-legwarmers', 'Rehearsal Rib Legwarmers', 'Long ribbed warmers that stay smooth through barre combinations.', 'legwear', 'common', 145, false, 2, 'Blush Rehearsal', '{"color":"dusty-rose","slots":["legwear"],"fabric":"rib-knit"}'),
  ('blush-rehearsal-duffel', 'Blush Rehearsal Duffel', 'A structured dance duffel with a separate pouch for shoe ribbons.', 'bag', 'rare', 610, false, 10, 'Blush Rehearsal', '{"color":"rose-blush","slots":["bag"],"material":"quilted-canvas"}'),

  ('satin-morning-cardigan', 'Satin Morning Cardigan', 'A fine ivory cardigan with a satin-lined tie and graceful cuffs.', 'outerwear', 'rare', 560, false, 12, 'Satin Morning', '{"color":"warm-ivory","slots":["outerwear"],"detail":"satin-lined-tie"}'),
  ('cream-studio-tights', 'Cream Studio Tights', 'Matte, supportive tights in a soft cream tone for studio class.', 'tights', 'common', 115, false, 1, 'Satin Morning', '{"color":"cream","slots":["tights"],"finish":"matte"}'),
  ('morning-pearl-studs', 'Morning Pearl Studs', 'Small ivory pearl studs with a polished, understated setting.', 'jewelry', 'rare', 520, false, 11, 'Satin Morning', '{"color":"ivory-pearl","slots":["jewelry"],"detail":"pearl-studs"}'),

  ('rose-academy-wrap-blouse', 'Rose Academy Wrap Blouse', 'A dusty-rose studio wrap with lace edging at the cuffs.', 'wrap_top', 'rare', 630, false, 13, 'Rose Academy', '{"color":"dusty-rose","slots":["wrap"],"detail":"lace-cuffs"}'),
  ('pressed-rose-bun-pin', 'Pressed Rose Bun Pin', 'A smooth rose-shaped pin made to finish a secure rehearsal bun.', 'hair_accessory', 'uncommon', 315, false, 6, 'Rose Academy', '{"color":"rose","slots":["hair_accessory"],"motif":"pressed-rose"}'),
  ('rose-academy-ribbon-case', 'Rose Academy Ribbon Case', 'A lined keepsake case that keeps pointe ribbons folded and tidy.', 'bag', 'rare', 580, false, 10, 'Rose Academy', '{"color":"dusty-rose","slots":["bag"],"material":"lined-satin"}'),

  ('pearl-barre-practice-flats', 'Pearl Barre Practice Flats', 'Supple canvas flats with a pearl-toned binding and quiet fit.', 'ballet_flats', 'uncommon', 390, false, 8, 'Pearl Barre', '{"color":"ivory-pearl","slots":["shoes"],"style":"canvas-flat"}'),
  ('pearl-barre-wrap-top', 'Pearl Barre Wrap Top', 'An ivory wrap with a delicate pearl stitch along the neckline.', 'wrap_top', 'rare', 570, false, 12, 'Pearl Barre', '{"color":"ivory","slots":["wrap"],"detail":"pearl-stitch"}'),
  ('ivory-barre-legwarmers', 'Ivory Barre Legwarmers', 'Soft ivory warmers with a fine rib and a smooth ankle finish.', 'legwear', 'uncommon', 225, false, 4, 'Pearl Barre', '{"color":"ivory","slots":["legwear"],"fabric":"fine-rib-knit"}'),

  ('moonlit-chiffon-skirt', 'Moonlit Chiffon Skirt', 'A recital-ready lavender overlay with a fine silver-thread edge.', 'skirt', 'epic', 1450, false, 30, 'Moonlit Recital', '{"color":"soft-lavender","slots":["skirt"],"detail":"silver-thread-hem"}'),
  ('moonlit-pointe-shoes', 'Moonlit Pointe Shoes', 'A keepsake pair finished with pale-lavender ribbons for recital night.', 'pointe_shoes', 'epic', 1850, false, 34, 'Moonlit Recital', '{"color":"lavender-ivory","slots":["shoes"],"style":"pointe"}'),
  ('moonlit-ribbon-pins', 'Moonlit Ribbon Pins', 'Two fine silver-toned pins with a small satin ribbon detail.', 'hair_accessory', 'rare', 790, false, 19, 'Moonlit Recital', '{"color":"soft-silver","slots":["hair_accessory"],"detail":"ribbon-pins"}'),
  ('first-recital-program', 'First Recital Program', 'A seasonal paper keepsake from a dancer’s very first recital.', 'seasonal', 'rare', 360, false, 8, 'Moonlit Recital', '{"motif":"first-recital","finish":"soft-foil"}'),

  ('sunday-barre-cardigan', 'Sunday Barre Cardigan', 'A relaxed cream cardigan with roomy sleeves for unhurried warm-ups.', 'outerwear', 'uncommon', 310, false, 4, 'Sunday Studio', '{"color":"oat-cream","slots":["outerwear"],"fabric":"cotton-knit"}'),
  ('sunday-studio-tote', 'Sunday Studio Tote', 'A light canvas tote with a shoe pocket and a stitched rose tab.', 'bag', 'uncommon', 285, false, 3, 'Sunday Studio', '{"color":"cream-rose","slots":["bag"],"material":"canvas"}'),
  ('soft-warmup-legwarmers', 'Soft Warm-up Legwarmers', 'Short, cloud-soft warmers for the first minutes of a studio session.', 'legwear', 'common', 105, false, 1, 'Sunday Studio', '{"color":"warm-cream","slots":["legwear"],"fabric":"soft-knit"}'),
  ('rose-hair-mist', 'Rose Hair Mist', 'A gentle rose-scented finishing mist for a neat studio bun.', 'beauty', 'uncommon', 185, false, 3, 'Sunday Studio', '{"color":"rosewater","slots":["hair_accessory"],"use":"hair-finishing-mist"}'),

  ('prima-satin-performance-skirt', 'Prima Satin Performance Skirt', 'A full, fluid satin skirt with a discreet lace-trimmed hem.', 'skirt', 'epic', 2450, false, 42, 'Prima Evening', '{"color":"ivory-blush","slots":["skirt"],"fabric":"satin","detail":"lace-hem"}'),
  ('prima-evening-pointe-shoes', 'Prima Evening Pointe Shoes', 'A polished recital keepsake with satin ribbons and pearl-pink binding.', 'pointe_shoes', 'legendary', 4200, false, 60, 'Prima Evening', '{"color":"pearl-pink","slots":["shoes"],"style":"pointe","finish":"satin"}'),
  ('prima-pearl-earrings', 'Prima Pearl Earrings', 'A refined pair of small pearl drops made for a recital updo.', 'jewelry', 'legendary', 3400, false, 52, 'Prima Evening', '{"color":"ivory-pearl","slots":["jewelry"],"detail":"pearl-drops"}'),

  ('ballet-pink-nail-lacquer', 'Ballet Pink Nail Lacquer', 'A sheer, tidy ballet-pink polish for a polished recital finish.', 'beauty', 'common', 90, false, 1, 'First Position', '{"color":"ballet-pink","slots":["accessory"],"use":"cosmetic-nail-lacquer"}'),
  ('studio-rosin-keepsake', 'Studio Rosin Keepsake', 'A small lidded rosin box with a ribbon loop for a studio bag.', 'studio_item', 'common', 130, false, 1, 'First Position', '{"motif":"rosin-box","finish":"ivory-lacquer"}'),
  ('ribbon-mending-kit', 'Ribbon Mending Kit', 'A neat studio tin with thread and spare elastic for shoe ribbons.', 'studio_item', 'uncommon', 245, false, 4, 'Sunday Studio', '{"motif":"ribbon-repair-kit","finish":"blush-tin"}');

INSERT INTO shop_item_collections (item_id, collection_id)
SELECT item.item_id, collection.collection_id
FROM shop_catalog AS item
INNER JOIN shop_collections AS collection ON collection.display_name = item.collection
WHERE item.item_id IN (
  'first-position-wrap-skirt', 'first-class-leotard', 'little-studio-bow',
  'blush-rehearsal-cardigan', 'blush-crossback-wrap', 'rehearsal-rib-legwarmers',
  'blush-rehearsal-duffel', 'satin-morning-cardigan', 'cream-studio-tights',
  'morning-pearl-studs', 'rose-academy-wrap-blouse', 'pressed-rose-bun-pin',
  'rose-academy-ribbon-case', 'pearl-barre-practice-flats', 'pearl-barre-wrap-top',
  'ivory-barre-legwarmers', 'moonlit-chiffon-skirt', 'moonlit-pointe-shoes',
  'moonlit-ribbon-pins', 'first-recital-program', 'sunday-barre-cardigan',
  'sunday-studio-tote', 'soft-warmup-legwarmers', 'rose-hair-mist',
  'prima-satin-performance-skirt', 'prima-evening-pointe-shoes', 'prima-pearl-earrings',
  'ballet-pink-nail-lacquer', 'studio-rosin-keepsake', 'ribbon-mending-kit'
);
