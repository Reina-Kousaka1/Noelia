CREATE TABLE shop_collections (
  collection_id text PRIMARY KEY CHECK (collection_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL UNIQUE,
  description text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE shop_item_collections (
  item_id text NOT NULL REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  collection_id text NOT NULL REFERENCES shop_collections (collection_id) ON DELETE RESTRICT,
  PRIMARY KEY (item_id, collection_id)
);

CREATE INDEX shop_item_collections_collection_idx
  ON shop_item_collections (collection_id, item_id);

INSERT INTO shop_collections (collection_id, display_name, description) VALUES
  ('first-position', 'First Position', 'Gentle first pieces for a dancer finding her place.'),
  ('studio-essentials', 'Studio Essentials', 'Quietly useful staples for class and daily practice.'),
  ('pointe-dreams', 'Pointe Dreams', 'Keepsakes for careful, patient pointe preparation.'),
  ('blush-rehearsal', 'Blush Rehearsal', 'Soft rose layers made for focused run-throughs.'),
  ('satin-morning', 'Satin Morning', 'A calm, polished start to a day at the barre.'),
  ('rose-academy', 'Rose Academy', 'Detailed studio pieces with a romantic academy feel.'),
  ('pearl-barre', 'Pearl Barre', 'Ivory knits and pearl details for measured practice.'),
  ('moonlit-recital', 'Moonlit Recital', 'Expressive evening pieces for a quiet stage glow.'),
  ('sunday-studio', 'Sunday Studio', 'Comfort-first favorites for an unhurried studio day.'),
  ('prima-evening', 'Prima Evening', 'Special recital keepsakes with refined stage details.'),
  ('petal-study', 'Petal Study', 'Sketchbook softness, pressed roses, and delicate lines.');

INSERT INTO shop_item_collections (item_id, collection_id)
SELECT item.item_id, collection.collection_id
FROM shop_catalog AS item
INNER JOIN shop_collections AS collection ON collection.display_name = item.collection;

INSERT INTO shop_catalog (
  item_id, display_name, description, category, rarity, price, stackable,
  minimum_ballet_level, collection, cosmetic_metadata
) VALUES
  ('petal-practice-leotard', 'Petal Practice Leotard', 'A softly gathered neckline and a secure, clean studio fit.', 'leotard', 'common', 190, false, 2, 'Blush Rehearsal', '{"color":"petal-pink","slots":["leotard"],"silhouette":"gathered-neck"}'),
  ('blush-chiffon-wrap-skirt', 'Blush Chiffon Wrap Skirt', 'A light wrap skirt with a double-finished chiffon edge.', 'skirt', 'uncommon', 240, false, 3, 'Blush Rehearsal', '{"color":"blush","slots":["skirt"],"fabric":"chiffon"}'),
  ('rose-tie-warmup-wrap', 'Rose-Tie Warm-up Wrap', 'A cross-front knit layer with long, narrow ballet ties.', 'wrap_top', 'common', 210, false, 2, 'Blush Rehearsal', '{"color":"dusty-rose","slots":["wrap"],"fabric":"rib-knit"}'),
  ('cloudline-legwarmers', 'Cloudline Legwarmers', 'Soft ribbed warmers shaped to stay comfortable through barre.', 'legwear', 'common', 115, false, 1, 'Blush Rehearsal', '{"color":"cream","slots":["legwear"],"fabric":"rib-knit"}'),
  ('rosette-studio-tote', 'Rosette Studio Tote', 'A roomy canvas carryall with a small stitched rose detail.', 'bag', 'uncommon', 280, false, 3, 'Blush Rehearsal', '{"color":"rose","slots":["bag"],"material":"canvas"}'),
  ('rehearsal-call-sheet', 'Rehearsal Call Sheet', 'A collectible card recording a favorite rehearsal day.', 'collectible', 'common', 65, false, 1, 'Blush Rehearsal', '{"motif":"call-sheet","finish":"matte"}'),
  ('petal-stitch-hair-ribbon', 'Petal-Stitch Hair Ribbon', 'A narrow satin ribbon finished with tiny embroidered petals.', 'hair_accessory', 'uncommon', 145, false, 2, 'Blush Rehearsal', '{"color":"rose","slots":["hair_accessory"],"finish":"embroidered-satin"}'),

  ('dawn-satin-leotard', 'Dawn Satin Leotard', 'A matte-satin sheen at the neckline keeps this classic leo subtle.', 'leotard', 'uncommon', 310, false, 4, 'Satin Morning', '{"color":"warm-blush","slots":["leotard"],"finish":"matte-satin"}'),
  ('folded-light-wrap-top', 'Folded Light Wrap Top', 'An ivory wrap top with a sculpted collar and fine rib texture.', 'wrap_top', 'uncommon', 265, false, 3, 'Satin Morning', '{"color":"ivory","slots":["wrap"],"fabric":"fine-rib"}'),
  ('first-light-ballet-flats', 'First Light Ballet Flats', 'Supple practice flats with a quiet double-elastic fit.', 'ballet_flats', 'uncommon', 295, false, 4, 'Satin Morning', '{"color":"rose-nude","slots":["shoes"],"style":"double-elastic-flat"}'),
  ('almond-knit-legwarmers', 'Almond Knit Legwarmers', 'Long almond-toned warmers with a soft, even rib.', 'legwear', 'common', 130, false, 1, 'Satin Morning', '{"color":"almond-cream","slots":["legwear"],"fabric":"rib-knit"}'),
  ('satin-shoe-pouch', 'Satin Shoe Pouch', 'A lined drawstring pouch that keeps studio shoes together.', 'bag', 'common', 95, false, 1, 'Satin Morning', '{"color":"ivory","slots":["bag"],"material":"lined-satin"}'),
  ('dewdrop-pearl-pins', 'Dewdrop Pearl Pins', 'A pair of small pearl-tipped pins for a secure rehearsal bun.', 'hair_accessory', 'rare', 360, false, 6, 'Satin Morning', '{"color":"ivory","slots":["hair_accessory"],"detail":"pearl-pins"}'),
  ('morning-barre-journal', 'Morning Barre Journal', 'A keepsake notebook cover for class notes and combinations.', 'collectible', 'uncommon', 180, false, 3, 'Satin Morning', '{"motif":"barre-journal","finish":"linen"}'),

  ('academy-rose-leotard', 'Academy Rose Leotard', 'A tailored rose leo with discreet lace at the back neckline.', 'leotard', 'rare', 520, false, 10, 'Rose Academy', '{"color":"dusty-rose","slots":["leotard"],"detail":"lace-back"}'),
  ('lacework-academy-skirt', 'Lacework Academy Skirt', 'A sheer over-skirt with a fine scalloped hem, made for class.', 'skirt', 'rare', 465, false, 9, 'Rose Academy', '{"color":"rose-ivory","slots":["skirt"],"fabric":"sheer-lace"}'),
  ('rose-academy-cardigan', 'Rose Academy Cardigan', 'A cropped button cardigan with a softly shaped studio fit.', 'outerwear', 'rare', 590, false, 11, 'Rose Academy', '{"color":"pale-rose","slots":["outerwear"],"fabric":"soft-knit"}'),
  ('petal-study-hair-comb', 'Petal Study Hair Comb', 'A rose-shaped comb with rounded teeth for a neat stage bun.', 'hair_accessory', 'uncommon', 275, false, 6, 'Rose Academy', '{"color":"blush","slots":["hair_accessory"],"motif":"rose"}'),
  ('academy-shoe-bag', 'Academy Shoe Bag', 'A structured drawstring bag with separate flat and pointe pockets.', 'bag', 'uncommon', 330, false, 7, 'Rose Academy', '{"color":"cream","slots":["bag"],"material":"quilted-cotton"}'),
  ('gold-thread-pendant', 'Gold-Thread Pendant', 'A small rose-gold pendant framed with a delicate thread motif.', 'jewelry', 'epic', 880, false, 18, 'Rose Academy', '{"color":"rose-gold","slots":["jewelry"],"motif":"threaded-rose"}'),
  ('rose-academy-portrait-card', 'Rose Academy Portrait Card', 'An illustrated keepsake from the Academy studio portrait day.', 'collectible', 'rare', 420, false, 10, 'Rose Academy', '{"motif":"studio-portrait","finish":"pearl-stock"}'),

  ('pearlline-leotard', 'Pearlline Leotard', 'An ivory leo with a narrow pearl-piped seam at the waist.', 'leotard', 'rare', 610, false, 12, 'Pearl Barre', '{"color":"ivory","slots":["leotard"],"detail":"pearl-piping"}'),
  ('pearl-veil-skirt', 'Pearl Veil Skirt', 'A layered practice skirt with a fine ivory net overlay.', 'skirt', 'epic', 940, false, 20, 'Pearl Barre', '{"color":"pearl","slots":["skirt"],"fabric":"layered-net"}'),
  ('barre-knit-shrug', 'Barre Knit Shrug', 'A soft short shrug designed to warm the shoulders between classes.', 'outerwear', 'uncommon', 350, false, 7, 'Pearl Barre', '{"color":"oat-ivory","slots":["outerwear"],"fabric":"soft-knit"}'),
  ('pearl-pointe-ribbons', 'Pearl Pointe Ribbons', 'A ribbon-and-elastic accessory set for carefully prepared shoes.', 'accessory', 'rare', 480, false, 10, 'Pearl Barre', '{"color":"pale-pink","slots":["accessory"],"use":"shoe-ribbon-set"}'),
  ('pearl-practice-flats', 'Pearl Practice Flats', 'Canvas flats with a cushioned lining for long center sessions.', 'ballet_flats', 'uncommon', 390, false, 8, 'Pearl Barre', '{"color":"pearl-pink","slots":["shoes"],"style":"cushioned-canvas"}'),
  ('ivory-pearl-hairpins', 'Ivory Pearl Hairpins', 'Three understated pearl pins in graduated sizes.', 'hair_accessory', 'rare', 430, false, 11, 'Pearl Barre', '{"color":"ivory","slots":["hair_accessory"],"detail":"graduated-pearls"}'),
  ('barre-technique-notebook', 'Barre Technique Notebook', 'A linen-bound keepsake for corrections, counts, and combinations.', 'collectible', 'common', 100, false, 1, 'Pearl Barre', '{"motif":"barre-notes","finish":"linen"}'),

  ('moonlit-stage-leotard', 'Moonlit Stage Leotard', 'A midnight-lavender leo with an ivory lace yoke.', 'leotard', 'epic', 1250, false, 25, 'Moonlit Recital', '{"color":"soft-lavender","slots":["leotard"],"detail":"ivory-lace-yoke"}'),
  ('crescent-tulle-skirt', 'Crescent Tulle Skirt', 'A weightless crescent-cut overlay that follows a clean line.', 'skirt', 'rare', 790, false, 18, 'Moonlit Recital', '{"color":"moon-ivory","slots":["skirt"],"fabric":"soft-tulle"}'),
  ('moonlit-rehearsal-cape', 'Moonlit Rehearsal Cape', 'A short satin-lined cape for the walk from studio to stage.', 'outerwear', 'epic', 1480, false, 28, 'Moonlit Recital', '{"color":"dusty-lavender","slots":["outerwear"],"lining":"satin"}'),
  ('starfall-rose-comb', 'Starfall Rose Comb', 'A hand-shaped comb with tiny star and rose details.', 'hair_accessory', 'rare', 760, false, 19, 'Moonlit Recital', '{"color":"silver-rose","slots":["hair_accessory"],"motif":"starfall-rose"}'),
  ('moonlit-ballet-flats', 'Moonlit Ballet Flats', 'A stage-ready flat with a soft lavender binding.', 'ballet_flats', 'rare', 680, false, 16, 'Moonlit Recital', '{"color":"lavender-ivory","slots":["shoes"],"style":"bound-flat"}'),
  ('recital-program-keepsake', 'Recital Program Keepsake', 'A collectible program cover from a moonlit studio recital.', 'event_item', 'epic', 1100, false, 22, 'Moonlit Recital', '{"motif":"moonlit-recital","finish":"foil-stamped"}'),
  ('night-rose-bracelet', 'Night Rose Bracelet', 'A delicate bracelet with one deep-rose glass bead.', 'jewelry', 'epic', 1320, false, 26, 'Moonlit Recital', '{"color":"rose-glass","slots":["jewelry"],"motif":"night-rose"}'),

  ('sunday-cotton-leotard', 'Sunday Cotton Leotard', 'A breathable cotton-blend leo with a simple rounded back.', 'leotard', 'common', 155, false, 1, 'Sunday Studio', '{"color":"soft-cream","slots":["leotard"],"fabric":"cotton-blend"}'),
  ('slow-morning-wrap-cardigan', 'Slow Morning Wrap Cardigan', 'A relaxed wrap cardigan with wide cuffs and soft ties.', 'wrap_top', 'uncommon', 285, false, 4, 'Sunday Studio', '{"color":"oat-cream","slots":["wrap"],"fabric":"cotton-knit"}'),
  ('cloud-soft-tights', 'Cloud-Soft Tights', 'Supple matte tights with a comfortable studio waistband.', 'tights', 'common', 120, false, 1, 'Sunday Studio', '{"color":"rose-nude","slots":["tights"],"finish":"matte"}'),
  ('sunday-studio-dance-bag', 'Sunday Studio Dance Bag', 'A canvas dance bag with a small inside pocket for ribbons.', 'bag', 'uncommon', 320, false, 5, 'Sunday Studio', '{"color":"cream","slots":["bag"],"material":"canvas"}'),
  ('ribbon-ankle-tights', 'Ribbon-Ankle Tights', 'Soft studio tights finished with a subtle ribbon ankle detail.', 'tights', 'uncommon', 220, false, 3, 'Sunday Studio', '{"color":"blush","slots":["tights"],"detail":"ankle-ribbon"}'),
  ('soft-step-canvas-flats', 'Soft-Step Canvas Flats', 'Light canvas flats with a flexible sole for easy daily practice.', 'ballet_flats', 'common', 170, false, 1, 'Sunday Studio', '{"color":"warm-nude","slots":["shoes"],"style":"canvas-flat"}'),
  ('sunday-studio-checklist', 'Sunday Studio Checklist', 'A collectible studio card for class-day rituals and packing notes.', 'collectible', 'common', 70, false, 1, 'Sunday Studio', '{"motif":"studio-checklist","finish":"soft-touch"}'),

  ('prima-embroidered-leotard', 'Prima Embroidered Leotard', 'A polished ivory leo with hand-drawn rose embroidery.', 'leotard', 'legendary', 3800, false, 55, 'Prima Evening', '{"color":"ivory-rose","slots":["leotard"],"detail":"rose-embroidery"}'),
  ('prima-evening-costume', 'Prima Evening Costume', 'A complete stage look whose fitted bodice and skirt share one silhouette.', 'collectible', 'legendary', 5200, false, 65, 'Prima Evening', '{"color":"blush-ivory","slots":["leotard","skirt"],"silhouette":"full-costume"}'),
  ('rose-gold-stage-tights', 'Rose-Gold Stage Tights', 'A smooth stage layer with a discreet rose-gold waist detail.', 'tights', 'rare', 920, false, 22, 'Prima Evening', '{"color":"warm-rose","slots":["tights"],"detail":"rose-gold-waist"}'),
  ('pearl-stage-tiara', 'Pearl Stage Tiara', 'A slim pearl arc made to sit securely above a recital bun.', 'hair_accessory', 'legendary', 4400, false, 60, 'Prima Evening', '{"color":"ivory-pearl","slots":["hair_accessory"],"detail":"pearl-arc"}'),
  ('prima-satin-shoe-case', 'Prima Satin Shoe Case', 'A padded two-compartment case for treasured studio shoes.', 'bag', 'epic', 2100, false, 35, 'Prima Evening', '{"color":"blush-satin","slots":["bag"],"material":"padded-satin"}'),
  ('recital-pendant-necklace', 'Recital Pendant Necklace', 'A small ivory rose charm on a fine adjustable chain.', 'jewelry', 'epic', 2650, false, 42, 'Prima Evening', '{"color":"rose-gold","slots":["jewelry"],"motif":"ivory-rose"}'),
  ('soloist-encore-medallion', 'Soloist Encore Medallion', 'A keepsake medallion for a dancer who has completed a recital.', 'collectible', 'epic', 1800, false, 30, 'Prima Evening', '{"motif":"encore-medallion","finish":"brushed-pearl"}'),

  ('petal-drape-wrap-top', 'Petal Drape Wrap Top', 'A softly draped studio wrap with a clean, secure tie.', 'wrap_top', 'uncommon', 260, false, 4, 'Petal Study', '{"color":"pale-rose","slots":["wrap"],"fabric":"light-knit"}'),
  ('pressed-rose-leotard', 'Pressed Rose Leotard', 'A rose-toned leo with a fine pressed-flower motif at the shoulder.', 'leotard', 'rare', 720, false, 16, 'Petal Study', '{"color":"dusty-rose","slots":["leotard"],"motif":"pressed-flower"}'),
  ('petal-curve-practice-skirt', 'Petal-Curve Practice Skirt', 'A softly curved practice skirt cut to fall evenly in turns.', 'skirt', 'uncommon', 390, false, 8, 'Petal Study', '{"color":"blush-ivory","slots":["skirt"],"silhouette":"curved-wrap"}'),
  ('rosehip-handwarmers', 'Rosehip Handwarmers', 'Light fingerless warmers for cool studios and quiet notes.', 'accessory', 'common', 105, false, 1, 'Petal Study', '{"color":"rosehip","slots":["accessory"],"fabric":"fine-knit"}'),
  ('watercolor-ballet-flats', 'Watercolor Ballet Flats', 'Canvas flats with a soft watercolor wash at the binding.', 'ballet_flats', 'rare', 630, false, 15, 'Petal Study', '{"color":"blush-lavender","slots":["shoes"],"style":"watercolor-binding"}'),
  ('petal-bookmark-set', 'Petal Bookmark Set', 'A pair of pressed-petal page markers for a dancer’s notebook.', 'collectible', 'common', 85, false, 1, 'Petal Study', '{"motif":"pressed-petal","finish":"translucent-paper"}'),
  ('studio-sketchbook', 'Studio Sketchbook', 'A linen sketchbook for choreographic shapes and costume ideas.', 'studio_item', 'uncommon', 210, false, 3, 'Petal Study', '{"motif":"movement-sketches","finish":"linen"}');

INSERT INTO shop_item_collections (item_id, collection_id) VALUES
  ('first-light-ballet-flats', 'studio-essentials'),
  ('pearl-practice-flats', 'pointe-dreams'),
  ('prima-embroidered-leotard', 'rose-academy'),
  ('prima-evening-costume', 'moonlit-recital'),
  ('satin-shoe-pouch', 'studio-essentials'),
  ('soft-step-canvas-flats', 'studio-essentials');
