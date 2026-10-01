CREATE TABLE relationship_proposals (
  proposal_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  proposer_user_id text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  target_user_id text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (proposer_user_id <> target_user_id),
  CHECK ((status = 'PENDING' AND decided_at IS NULL) OR (status <> 'PENDING' AND decided_at IS NOT NULL))
);

CREATE INDEX relationship_proposals_pair_history_idx
  ON relationship_proposals (proposer_user_id, target_user_id, created_at DESC);

CREATE TABLE relationship_pending_participants (
  discord_user_id text PRIMARY KEY REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  proposal_id bigint NOT NULL REFERENCES relationship_proposals (proposal_id) ON DELETE CASCADE,
  UNIQUE (proposal_id, discord_user_id)
);

CREATE TABLE relationships (
  relationship_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  partner_a_user_id text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  partner_b_user_id text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'MARRIED' CHECK (status IN ('MARRIED', 'DIVORCED')),
  married_at timestamptz NOT NULL DEFAULT now(),
  divorced_at timestamptz,
  CHECK (partner_a_user_id <> partner_b_user_id),
  CHECK (partner_a_user_id::numeric < partner_b_user_id::numeric),
  CHECK ((status = 'MARRIED' AND divorced_at IS NULL) OR (status = 'DIVORCED' AND divorced_at IS NOT NULL)),
  UNIQUE (relationship_id, partner_a_user_id),
  UNIQUE (relationship_id, partner_b_user_id)
);

CREATE TABLE relationship_participants (
  relationship_id bigint NOT NULL REFERENCES relationships (relationship_id) ON DELETE RESTRICT,
  discord_user_id text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  PRIMARY KEY (relationship_id, discord_user_id)
);

CREATE TABLE relationship_members (
  discord_user_id text PRIMARY KEY REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  relationship_id bigint NOT NULL,
  FOREIGN KEY (relationship_id, discord_user_id)
    REFERENCES relationship_participants (relationship_id, discord_user_id) ON DELETE RESTRICT
);

CREATE TABLE relationship_requests (
  interaction_id text PRIMARY KEY CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  actor_user_id text NOT NULL REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('PROPOSE', 'ACCEPT', 'DECLINE', 'CANCEL', 'DIVORCE')),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  proposal_id bigint REFERENCES relationship_proposals (proposal_id) ON DELETE RESTRICT,
  relationship_id bigint REFERENCES relationships (relationship_id) ON DELETE RESTRICT,
  result_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((completed_at IS NULL AND result_status IS NULL) OR (completed_at IS NOT NULL AND result_status IS NOT NULL))
);

CREATE INDEX relationship_requests_actor_time_idx
  ON relationship_requests (actor_user_id, created_at DESC);
