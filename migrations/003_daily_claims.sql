ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_interaction_transaction_key
  UNIQUE (idempotency_key, id);

CREATE TABLE daily_claims (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  reward_amount bigint NOT NULL CHECK (reward_amount > 0),
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  wallet_transaction_id bigint NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL,
  next_claim_at timestamptz NOT NULL,
  CHECK (next_claim_at > claimed_at),
  FOREIGN KEY (interaction_id, wallet_transaction_id)
    REFERENCES wallet_transactions (idempotency_key, id) ON DELETE RESTRICT
);

CREATE INDEX daily_claims_user_time_idx
  ON daily_claims (discord_user_id, claimed_at DESC, interaction_id DESC);

CREATE FUNCTION reject_daily_claim_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'daily claim history is immutable';
END;
$$;

CREATE TRIGGER daily_claims_append_only
BEFORE UPDATE OR DELETE ON daily_claims
FOR EACH ROW
EXECUTE FUNCTION reject_daily_claim_mutation();

CREATE TRIGGER daily_claims_no_truncate
BEFORE TRUNCATE ON daily_claims
FOR EACH STATEMENT
EXECUTE FUNCTION reject_daily_claim_mutation();
