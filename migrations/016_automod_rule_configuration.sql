CREATE TABLE automod_guild_rule_config (
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  rule_key text NOT NULL CHECK (rule_key IN (
    'message_flood', 'repeated_message', 'mention_spam', 'invite_advertising', 'join_burst'
  )),
  enabled boolean NOT NULL DEFAULT false,
  threshold smallint NOT NULL CHECK (threshold BETWEEN 1 AND 100),
  window_seconds smallint NOT NULL CHECK (window_seconds BETWEEN 1 AND 3600),
  escalation text NOT NULL DEFAULT 'OBSERVE' CHECK (escalation IN ('OBSERVE', 'CASE')),
  updated_by text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, rule_key)
);

CREATE TABLE automod_guild_allowlist (
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  added_by text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, discord_user_id)
);

CREATE TABLE automod_config_requests (
  interaction_id text PRIMARY KEY CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  actor_user_id text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('SET_RULE', 'ALLOW_USER', 'UNALLOW_USER')),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX automod_allowlist_guild_idx
  ON automod_guild_allowlist (guild_id, discord_user_id);

CREATE INDEX automod_config_requests_guild_time_idx
  ON automod_config_requests (guild_id, created_at DESC);

CREATE FUNCTION reject_automod_config_request_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AutoMod configuration request history is immutable';
END;
$$;

CREATE TRIGGER automod_config_requests_append_only
BEFORE UPDATE OR DELETE ON automod_config_requests
FOR EACH ROW
EXECUTE FUNCTION reject_automod_config_request_mutation();

CREATE TRIGGER automod_config_requests_no_truncate
BEFORE TRUNCATE ON automod_config_requests
FOR EACH STATEMENT
EXECUTE FUNCTION reject_automod_config_request_mutation();
