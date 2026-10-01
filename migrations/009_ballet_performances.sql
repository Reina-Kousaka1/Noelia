CREATE TABLE ballet_performance_catalog (
  performance_id text PRIMARY KEY CHECK (performance_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL,
  description text NOT NULL,
  minimum_level integer NOT NULL CHECK (minimum_level BETWEEN 1 AND 100),
  cooldown_ms bigint NOT NULL CHECK (cooldown_ms BETWEEN 1 AND 31536000000),
  xp_reward bigint NOT NULL CHECK (xp_reward > 0),
  slippers_reward bigint NOT NULL CHECK (slippers_reward > 0),
  required_equipped_item_id text
    REFERENCES shop_catalog (item_id) ON DELETE RESTRICT,
  required_activity_code text
    REFERENCES ballet_activity_catalog (activity_code) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true
);

INSERT INTO ballet_performance_catalog (
  performance_id, display_name, description, minimum_level, cooldown_ms,
  xp_reward, slippers_reward, required_equipped_item_id, required_activity_code
) VALUES
  ('spring-recital', 'Spring Recital',
   'A short recital variation with a calm opening and a clear final pose.',
   10, 604800000, 100, 100, NULL, 'performance'),
  ('moonlit-showcase', 'Moonlit Showcase',
   'A lyrical studio showcase built around musical detail and steady presence.',
   20, 864000000, 180, 200, NULL, 'recital'),
  ('prima-audition', 'Prima Audition',
   'A focused audition variation that asks for precise technique and pointe control.',
   35, 1209600000, 300, 350, 'pearl-pointe-shoes', 'audition');

CREATE TABLE ballet_performance_stat_requirements (
  performance_id text NOT NULL
    REFERENCES ballet_performance_catalog (performance_id) ON DELETE RESTRICT,
  stat_key text NOT NULL CHECK (stat_key IN (
    'technique', 'flexibility', 'musicality', 'performance', 'pointe', 'stamina'
  )),
  minimum_value integer NOT NULL CHECK (minimum_value BETWEEN 0 AND 100),
  score_weight integer NOT NULL CHECK (score_weight BETWEEN 1 AND 100),
  PRIMARY KEY (performance_id, stat_key)
);

INSERT INTO ballet_performance_stat_requirements (
  performance_id, stat_key, minimum_value, score_weight
) VALUES
  ('spring-recital', 'technique', 15, 30),
  ('spring-recital', 'musicality', 15, 25),
  ('spring-recital', 'performance', 20, 45),
  ('moonlit-showcase', 'technique', 30, 20),
  ('moonlit-showcase', 'musicality', 30, 25),
  ('moonlit-showcase', 'performance', 35, 35),
  ('moonlit-showcase', 'stamina', 20, 20),
  ('prima-audition', 'technique', 55, 45),
  ('prima-audition', 'performance', 50, 35),
  ('prima-audition', 'pointe', 25, 20);

CREATE TABLE ballet_performance_completions (
  interaction_id text PRIMARY KEY CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  performance_id text NOT NULL
    REFERENCES ballet_performance_catalog (performance_id) ON DELETE RESTRICT,
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  tier text NOT NULL CHECK (tier IN ('BRONZE', 'SILVER', 'GOLD', 'PRIMA')),
  xp_awarded bigint NOT NULL CHECK (xp_awarded > 0),
  slippers_awarded bigint NOT NULL CHECK (slippers_awarded > 0),
  total_xp_after bigint NOT NULL CHECK (total_xp_after >= 0),
  level_after integer NOT NULL CHECK (level_after BETWEEN 1 AND 100),
  wallet_transaction_id bigint NOT NULL UNIQUE,
  wallet_balance_after bigint NOT NULL CHECK (wallet_balance_after >= 0),
  completed_at timestamptz NOT NULL,
  next_available_at timestamptz NOT NULL,
  CHECK (next_available_at > completed_at),
  FOREIGN KEY (interaction_id, wallet_transaction_id)
    REFERENCES wallet_transactions (idempotency_key, id) ON DELETE RESTRICT
);

CREATE INDEX ballet_performance_user_history_idx
  ON ballet_performance_completions (
    discord_user_id, performance_id, completed_at DESC, interaction_id DESC
  );

CREATE FUNCTION reject_ballet_performance_completion_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ballet performance history is immutable';
END;
$$;

CREATE TRIGGER ballet_performance_completions_append_only
BEFORE UPDATE OR DELETE ON ballet_performance_completions
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_performance_completion_mutation();

CREATE TRIGGER ballet_performance_completions_no_truncate
BEFORE TRUNCATE ON ballet_performance_completions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_performance_completion_mutation();
