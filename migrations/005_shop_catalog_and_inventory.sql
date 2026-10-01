CREATE TABLE shop_catalog (
  item_id text PRIMARY KEY CHECK (item_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'leotard', 'skirt', 'wrap_top', 'outerwear', 'legwear', 'tights',
    'ballet_flats', 'pointe_shoes', 'bag', 'hair_accessory', 'jewelry',
    'accessory', 'studio_item', 'collectible', 'seasonal', 'event_item'
  )),
  rarity text NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  price bigint NOT NULL CHECK (price > 0),
  active boolean NOT NULL DEFAULT true,
  purchasable boolean NOT NULL DEFAULT true,
  stackable boolean NOT NULL DEFAULT false,
  minimum_ballet_level integer CHECK (minimum_ballet_level BETWEEN 1 AND 100),
  collection text,
  cosmetic_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(cosmetic_metadata) = 'object')
);

INSERT INTO shop_catalog (
  item_id, display_name, description, category, rarity, price, stackable,
  minimum_ballet_level, collection, cosmetic_metadata
) VALUES
  (
    'satin-ribbon-bow', 'Satin Ribbon Bow',
    'A soft blush satin bow for a neat studio bun.',
    'hair_accessory', 'common', 80, false, 1, 'First Position',
    '{"color":"blush-pink","slots":["hair_accessory"],"finish":"satin"}'::jsonb
  ),
  (
    'soft-pink-leotard', 'Soft Pink Leotard',
    'A clean, classic leotard in a gentle ballet pink.',
    'leotard', 'common', 175, false, 1, 'First Position',
    '{"color":"soft-pink","slots":["leotard"],"silhouette":"classic"}'::jsonb
  ),
  (
    'classic-ballet-flats', 'Classic Ballet Flats',
    'Lightweight ballet flats for daily barre and center practice.',
    'ballet_flats', 'common', 150, false, 1, 'Studio Essentials',
    '{"color":"rose-nude","slots":["shoes"],"style":"ballet-flat"}'::jsonb
  ),
  (
    'ivory-wrap-cardigan', 'Ivory Wrap Cardigan',
    'A soft ivory wrap layer for warm-ups between classes.',
    'wrap_top', 'uncommon', 225, false, 2, 'Studio Essentials',
    '{"color":"ivory","slots":["wrap"],"fabric":"soft-knit"}'::jsonb
  ),
  (
    'rose-chiffon-skirt', 'Rose Chiffon Skirt',
    'A light rose chiffon skirt made for graceful studio movement.',
    'skirt', 'uncommon', 260, false, 2, 'First Position',
    '{"color":"rose","slots":["skirt"],"fabric":"chiffon"}'::jsonb
  ),
  (
    'pearl-pointe-shoes', 'Pearl Pointe Shoes',
    'A keepsake pair of pointe shoes for a dedicated dancer.',
    'pointe_shoes', 'rare', 500, false, 5, 'Pointe Dreams',
    '{"color":"pearl-pink","slots":["shoes"],"style":"pointe"}'::jsonb
  );

CREATE TABLE user_inventory (
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  item_id text NOT NULL
    REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 2147483647),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN (
    'SHOP_PURCHASE', 'BALLET_REWARD', 'DAILY_REWARD', 'EVENT_REWARD', 'ADMIN_GRANT'
  )),
  PRIMARY KEY (discord_user_id, item_id)
);

CREATE TABLE shop_purchases (
  purchase_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  interaction_id text NOT NULL UNIQUE
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  item_id text NOT NULL
    REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99999),
  unit_price bigint NOT NULL CHECK (unit_price > 0),
  total_price bigint NOT NULL CHECK (total_price > 0),
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  inventory_quantity_after integer NOT NULL CHECK (inventory_quantity_after > 0),
  wallet_transaction_id bigint NOT NULL UNIQUE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (interaction_id, wallet_transaction_id)
    REFERENCES wallet_transactions (idempotency_key, id) ON DELETE RESTRICT
);

CREATE INDEX shop_purchases_user_time_idx
  ON shop_purchases (discord_user_id, purchased_at DESC, purchase_id DESC);

CREATE FUNCTION reject_shop_purchase_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'shop purchase history is immutable';
END;
$$;

CREATE TRIGGER shop_purchases_append_only
BEFORE UPDATE OR DELETE ON shop_purchases
FOR EACH ROW
EXECUTE FUNCTION reject_shop_purchase_mutation();

CREATE TRIGGER shop_purchases_no_truncate
BEFORE TRUNCATE ON shop_purchases
FOR EACH STATEMENT
EXECUTE FUNCTION reject_shop_purchase_mutation();
