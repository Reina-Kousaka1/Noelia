CREATE TABLE ballet_academy_uniform_claims (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL UNIQUE
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  leotard_item_id text NOT NULL REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  leotard_display_name text NOT NULL,
  tights_item_id text NOT NULL REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  tights_display_name text NOT NULL,
  shoes_item_id text NOT NULL REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  shoes_display_name text NOT NULL,
  replaced_item_names text[] NOT NULL DEFAULT ARRAY[]::text[],
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (leotard_item_id <> tights_item_id),
  CHECK (leotard_item_id <> shoes_item_id),
  CHECK (tights_item_id <> shoes_item_id)
);

CREATE FUNCTION reject_ballet_academy_uniform_claim_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Ballet Academy uniform claims are immutable';
END;
$$;

CREATE TRIGGER ballet_academy_uniform_claims_append_only
BEFORE UPDATE OR DELETE ON ballet_academy_uniform_claims
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_academy_uniform_claim_mutation();

CREATE TRIGGER ballet_academy_uniform_claims_no_truncate
BEFORE TRUNCATE ON ballet_academy_uniform_claims
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_academy_uniform_claim_mutation();
