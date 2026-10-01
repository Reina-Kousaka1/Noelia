CREATE TABLE discord_users (
  discord_user_id text PRIMARY KEY
    CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
