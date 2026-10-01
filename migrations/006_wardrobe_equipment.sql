CREATE TABLE wardrobe_equipment (
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  slot text NOT NULL CHECK (slot IN (
    'leotard', 'skirt', 'wrap', 'outerwear', 'legwear', 'tights',
    'shoes', 'bag', 'hair_accessory', 'jewelry', 'accessory'
  )),
  item_id text NOT NULL,
  equipped_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_user_id, slot),
  FOREIGN KEY (discord_user_id, item_id)
    REFERENCES user_inventory (discord_user_id, item_id) ON DELETE RESTRICT
);

CREATE INDEX wardrobe_equipment_item_idx
  ON wardrobe_equipment (discord_user_id, item_id);
