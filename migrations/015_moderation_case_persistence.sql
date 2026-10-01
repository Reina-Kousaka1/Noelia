CREATE TABLE moderation_cases (
  case_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  target_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('note', 'warning', 'timeout', 'kick', 'ban')),
  source text NOT NULL CHECK (source IN ('manual', 'automod', 'system')),
  reason text CHECK (reason IS NULL OR length(reason) <= 1000),
  occurred_at timestamptz NOT NULL,
  expires_at timestamptz,
  idempotency_key text NOT NULL
    CHECK (idempotency_key ~ '^[A-Za-z0-9:._-]{1,128}$'),
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actor_user_id <> target_user_id),
  CHECK (
    (action = 'timeout' AND expires_at IS NOT NULL AND expires_at > occurred_at) OR
    (action <> 'timeout' AND expires_at IS NULL)
  ),
  UNIQUE (guild_id, idempotency_key)
);

CREATE INDEX moderation_cases_target_time_idx
  ON moderation_cases (guild_id, target_user_id, occurred_at DESC, case_id DESC);

CREATE INDEX moderation_cases_actor_time_idx
  ON moderation_cases (guild_id, actor_user_id, occurred_at DESC, case_id DESC);

CREATE FUNCTION reject_moderation_case_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'moderation case history is immutable';
END;
$$;

CREATE TRIGGER moderation_cases_append_only
BEFORE UPDATE OR DELETE ON moderation_cases
FOR EACH ROW
EXECUTE FUNCTION reject_moderation_case_mutation();

CREATE TRIGGER moderation_cases_no_truncate
BEFORE TRUNCATE ON moderation_cases
FOR EACH STATEMENT
EXECUTE FUNCTION reject_moderation_case_mutation();

-- The external Discord action cannot participate in a PostgreSQL transaction.
-- A case is inserted before that call, then receives one immutable outcome fact.
-- A case with no outcome is deliberately shown as pending/unknown after a crash;
-- interaction replays must not repeat the external action.
CREATE TABLE moderation_case_outcomes (
  case_id bigint PRIMARY KEY
    REFERENCES moderation_cases (case_id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('SUCCEEDED', 'FAILED', 'UNKNOWN')),
  outcome_code text CHECK (outcome_code IS NULL OR outcome_code ~ '^[A-Za-z0-9_:-]{1,64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (outcome <> 'SUCCEEDED' OR outcome_code IS NULL)
);

CREATE FUNCTION reject_moderation_outcome_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'moderation action outcomes are immutable';
END;
$$;

CREATE TRIGGER moderation_case_outcomes_append_only
BEFORE UPDATE OR DELETE ON moderation_case_outcomes
FOR EACH ROW
EXECUTE FUNCTION reject_moderation_outcome_mutation();

CREATE TRIGGER moderation_case_outcomes_no_truncate
BEFORE TRUNCATE ON moderation_case_outcomes
FOR EACH STATEMENT
EXECUTE FUNCTION reject_moderation_outcome_mutation();
