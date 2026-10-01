CREATE TABLE wardrobe_presets (
  preset_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 32 AND name = btrim(name)),
  name_key text NOT NULL CHECK (length(name_key) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discord_user_id, preset_id),
  CONSTRAINT wardrobe_presets_user_name_key UNIQUE (discord_user_id, name_key)
);

CREATE TABLE wardrobe_preset_equipment (
  discord_user_id text NOT NULL,
  preset_id bigint NOT NULL,
  slot text NOT NULL CHECK (slot IN (
    'leotard', 'skirt', 'wrap', 'outerwear', 'legwear', 'tights',
    'shoes', 'bag', 'hair_accessory', 'jewelry', 'accessory'
  )),
  item_id text NOT NULL REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  PRIMARY KEY (discord_user_id, preset_id, slot),
  FOREIGN KEY (discord_user_id, preset_id)
    REFERENCES wardrobe_presets (discord_user_id, preset_id) ON DELETE CASCADE
);

CREATE INDEX wardrobe_presets_user_updated_idx
  ON wardrobe_presets (discord_user_id, updated_at DESC, preset_id DESC);

CREATE TABLE wardrobe_preset_requests (
  interaction_id text PRIMARY KEY CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN (
    'CREATE', 'SAVE', 'APPLY', 'RENAME', 'DELETE', 'CLEAR'
  )),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wardrobe_preset_requests_user_time_idx
  ON wardrobe_preset_requests (discord_user_id, created_at DESC);

CREATE FUNCTION reject_wardrobe_preset_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'wardrobe preset requests are immutable';
END;
$$;

CREATE TRIGGER wardrobe_preset_requests_append_only
BEFORE UPDATE OR DELETE ON wardrobe_preset_requests
FOR EACH ROW
EXECUTE FUNCTION reject_wardrobe_preset_request_mutation();

CREATE TRIGGER wardrobe_preset_requests_no_truncate
BEFORE TRUNCATE ON wardrobe_preset_requests
FOR EACH STATEMENT
EXECUTE FUNCTION reject_wardrobe_preset_request_mutation();
