CREATE TABLE ballet_activity_catalog (
  activity_code text PRIMARY KEY,
  display_name text NOT NULL,
  minimum_level integer NOT NULL DEFAULT 1 CHECK (minimum_level BETWEEN 1 AND 100),
  xp_reward bigint NOT NULL CHECK (xp_reward > 0),
  slippers_reward bigint NOT NULL CHECK (slippers_reward > 0),
  cooldown_ms bigint NOT NULL CHECK (cooldown_ms BETWEEN 1 AND 31536000000),
  active boolean NOT NULL DEFAULT true
);

INSERT INTO ballet_activity_catalog (
  activity_code, display_name, minimum_level, xp_reward, slippers_reward, cooldown_ms
) VALUES
  ('class', 'Class', 1, 15, 20, 3600000),
  ('barre', 'Barre', 1, 10, 15, 1800000),
  ('center-practice', 'Center Practice', 2, 25, 30, 7200000),
  ('stretching', 'Stretching', 1, 8, 10, 1800000),
  ('technique', 'Technique', 3, 30, 35, 10800000),
  ('pointe-practice', 'Pointe Practice', 5, 40, 50, 21600000);

CREATE TABLE ballet_progress (
  discord_user_id text PRIMARY KEY
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  total_xp bigint NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ballet_activity_completions (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  activity_code text NOT NULL
    REFERENCES ballet_activity_catalog (activity_code) ON DELETE RESTRICT,
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  xp_awarded bigint NOT NULL CHECK (xp_awarded > 0),
  slippers_awarded bigint NOT NULL CHECK (slippers_awarded > 0),
  total_xp_after bigint NOT NULL CHECK (total_xp_after >= 0),
  level_after integer NOT NULL CHECK (level_after BETWEEN 1 AND 100),
  wallet_transaction_id bigint NOT NULL UNIQUE,
  completed_at timestamptz NOT NULL,
  next_available_at timestamptz NOT NULL,
  CHECK (next_available_at > completed_at),
  FOREIGN KEY (interaction_id, wallet_transaction_id)
    REFERENCES wallet_transactions (idempotency_key, id) ON DELETE RESTRICT
);

CREATE INDEX ballet_activity_user_history_idx
  ON ballet_activity_completions (
    discord_user_id, activity_code, completed_at DESC, interaction_id DESC
  );

CREATE FUNCTION reject_ballet_completion_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ballet activity history is immutable';
END;
$$;

CREATE TRIGGER ballet_completions_append_only
BEFORE UPDATE OR DELETE ON ballet_activity_completions
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_completion_mutation();

CREATE TRIGGER ballet_completions_no_truncate
BEFORE TRUNCATE ON ballet_activity_completions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_completion_mutation();
