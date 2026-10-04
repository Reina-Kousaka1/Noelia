-- V3 training state is separate from the established six Ballet stats. All
-- values below are fictional game state, not health or training advice.
CREATE TABLE ballet_training_skills (
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  skill_key text NOT NULL CHECK (skill_key IN (
    'balance', 'core_control', 'footwork', 'coordination',
    'turn_control', 'jump_control', 'placement', 'musicality'
  )),
  skill_value integer NOT NULL DEFAULT 0 CHECK (skill_value BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (discord_user_id, skill_key)
);

CREATE TABLE ballet_training_condition (
  discord_user_id text PRIMARY KEY
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  energy integer NOT NULL DEFAULT 70 CHECK (energy BETWEEN 0 AND 100),
  nutrition integer NOT NULL DEFAULT 70 CHECK (nutrition BETWEEN 0 AND 100),
  fatigue integer NOT NULL DEFAULT 10 CHECK (fatigue BETWEEN 0 AND 100),
  sleep_debt integer NOT NULL DEFAULT 0 CHECK (sleep_debt BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE ballet_stamina_cycles (
  cycle_id uuid PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  target_workload integer NOT NULL CHECK (target_workload BETWEEN 1 AND 20),
  completed_workload integer NOT NULL DEFAULT 0 CHECK (completed_workload >= 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'EXPIRED')),
  below_floor_exception boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL,
  completed_at timestamptz,
  UNIQUE (discord_user_id, cycle_number),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CHECK (completed_workload <= target_workload)
);

CREATE UNIQUE INDEX ballet_stamina_cycles_one_active_idx
  ON ballet_stamina_cycles (discord_user_id)
  WHERE status = 'ACTIVE';

CREATE INDEX ballet_stamina_cycles_history_idx
  ON ballet_stamina_cycles (discord_user_id, cycle_number DESC);

CREATE TABLE ballet_stamina_workload_events (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  cycle_id uuid NOT NULL REFERENCES ballet_stamina_cycles (cycle_id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('CLASS_ATTEMPT', 'BALLET_PRACTICE')),
  source_reference text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (discord_user_id, source_type, source_reference)
);

CREATE INDEX ballet_stamina_workload_user_history_idx
  ON ballet_stamina_workload_events (discord_user_id, recorded_at DESC);

CREATE TABLE ballet_training_skill_events (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('CLASS_ATTEMPT', 'BALLET_PRACTICE')),
  source_reference text NOT NULL,
  gains jsonb NOT NULL CHECK (jsonb_typeof(gains) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (discord_user_id, source_type, source_reference)
);

CREATE INDEX ballet_training_skill_events_daily_idx
  ON ballet_training_skill_events (discord_user_id, recorded_at DESC);

CREATE TABLE ballet_training_attempt_effects (
  attempt_id uuid PRIMARY KEY
    REFERENCES ballet_class_attempts (attempt_id) ON DELETE RESTRICT,
  interaction_id text NOT NULL UNIQUE
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  training_skill_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(training_skill_snapshot) = 'object'),
  condition_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(condition_snapshot) = 'object'),
  performance_modifier integer NOT NULL CHECK (performance_modifier BETWEEN -12 AND 10),
  setback_triggered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX ballet_training_attempt_effects_user_history_idx
  ON ballet_training_attempt_effects (discord_user_id, created_at DESC);

CREATE TABLE ballet_training_setbacks (
  setback_id uuid PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind = 'MINOR_TRAINING_STRAIN'),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'RECOVERED')),
  required_rehab_sessions integer NOT NULL CHECK (required_rehab_sessions > 0),
  completed_rehab_sessions integer NOT NULL DEFAULT 0 CHECK (completed_rehab_sessions >= 0),
  source_attempt_id uuid NOT NULL UNIQUE
    REFERENCES ballet_class_attempts (attempt_id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  recovered_at timestamptz,
  UNIQUE (setback_id, discord_user_id),
  CHECK ((status = 'RECOVERED') = (recovered_at IS NOT NULL)),
  CHECK (completed_rehab_sessions <= required_rehab_sessions)
);

CREATE UNIQUE INDEX ballet_training_setbacks_one_active_idx
  ON ballet_training_setbacks (discord_user_id)
  WHERE status = 'ACTIVE';

CREATE TABLE ballet_rehabilitation_sessions (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL,
  setback_id uuid NOT NULL,
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (setback_id, discord_user_id)
    REFERENCES ballet_training_setbacks (setback_id, discord_user_id) ON DELETE RESTRICT
);

CREATE INDEX ballet_rehabilitation_user_history_idx
  ON ballet_rehabilitation_sessions (discord_user_id, completed_at DESC);

CREATE TABLE ballet_training_actions (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  action_type text NOT NULL CHECK (action_type IN (
    'REST', 'SLEEP', 'NOURISH', 'REHABILITATE', 'SHOE_FIT'
  )),
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX ballet_training_actions_user_history_idx
  ON ballet_training_actions (discord_user_id, created_at DESC);

CREATE TABLE ballet_equipment_fit_profiles (
  discord_user_id text PRIMARY KEY
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  game_shoe_size_eu numeric(3,1) NOT NULL
    CHECK (game_shoe_size_eu BETWEEN 25 AND 45),
  game_fit text NOT NULL CHECK (game_fit IN ('STANDARD', 'NARROW', 'WIDE')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (game_shoe_size_eu * 2 = trunc(game_shoe_size_eu * 2))
);

-- Existing catalog rows stay in place. This annotation is optional metadata
-- for the fictional game profile and never represents a physical fit claim.
UPDATE shop_catalog
SET cosmetic_metadata = COALESCE(cosmetic_metadata, '{}'::jsonb) ||
  '{"fictional_game_fit":{"minimum_eu":25,"maximum_eu":45,"profiles":["STANDARD","NARROW","WIDE"]}}'::jsonb
WHERE category IN ('ballet_flats', 'pointe_shoes');

CREATE FUNCTION reject_ballet_training_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Ballet training audit history is immutable';
END;
$$;

CREATE TRIGGER ballet_stamina_workload_events_append_only
BEFORE UPDATE OR DELETE ON ballet_stamina_workload_events
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_training_history_mutation();
CREATE TRIGGER ballet_stamina_workload_events_no_truncate
BEFORE TRUNCATE ON ballet_stamina_workload_events
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_training_history_mutation();

CREATE TRIGGER ballet_training_skill_events_append_only
BEFORE UPDATE OR DELETE ON ballet_training_skill_events
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_training_history_mutation();
CREATE TRIGGER ballet_training_skill_events_no_truncate
BEFORE TRUNCATE ON ballet_training_skill_events
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_training_history_mutation();

CREATE TRIGGER ballet_training_attempt_effects_append_only
BEFORE UPDATE OR DELETE ON ballet_training_attempt_effects
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_training_history_mutation();
CREATE TRIGGER ballet_training_attempt_effects_no_truncate
BEFORE TRUNCATE ON ballet_training_attempt_effects
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_training_history_mutation();

CREATE TRIGGER ballet_rehabilitation_sessions_append_only
BEFORE UPDATE OR DELETE ON ballet_rehabilitation_sessions
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_training_history_mutation();
CREATE TRIGGER ballet_rehabilitation_sessions_no_truncate
BEFORE TRUNCATE ON ballet_rehabilitation_sessions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_training_history_mutation();

CREATE TRIGGER ballet_training_actions_append_only
BEFORE UPDATE OR DELETE ON ballet_training_actions
FOR EACH ROW
EXECUTE FUNCTION reject_ballet_training_history_mutation();
CREATE TRIGGER ballet_training_actions_no_truncate
BEFORE TRUNCATE ON ballet_training_actions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_ballet_training_history_mutation();
