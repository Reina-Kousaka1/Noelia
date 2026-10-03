CREATE TABLE academy_stage_progress (
  discord_user_id text PRIMARY KEY
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  legacy_baseline_stage_id text NOT NULL
    CHECK (legacy_baseline_stage_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  current_stage_id text NOT NULL
    CHECK (current_stage_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION protect_academy_stage_baseline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.legacy_baseline_stage_id <> OLD.legacy_baseline_stage_id THEN
    RAISE EXCEPTION 'Academy assessment legacy baseline is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academy_stage_progress_baseline_immutable
BEFORE UPDATE ON academy_stage_progress
FOR EACH ROW
EXECUTE FUNCTION protect_academy_stage_baseline();

CREATE FUNCTION reject_academy_assessment_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Academy assessment history cannot be deleted or truncated';
END;
$$;

CREATE TRIGGER academy_stage_progress_no_delete
BEFORE DELETE ON academy_stage_progress
FOR EACH ROW
EXECUTE FUNCTION reject_academy_assessment_history_mutation();

CREATE TRIGGER academy_stage_progress_no_truncate
BEFORE TRUNCATE ON academy_stage_progress
FOR EACH STATEMENT
EXECUTE FUNCTION reject_academy_assessment_history_mutation();

CREATE TABLE academy_assessment_attempts (
  attempt_id uuid PRIMARY KEY,
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  source_stage_id text NOT NULL
    CHECK (source_stage_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  target_stage_id text NOT NULL
    CHECK (target_stage_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  practical_class_id uuid NOT NULL,
  practical_review_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(practical_review_snapshot) = 'object'),
  questions_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(questions_snapshot) = 'array'
      AND jsonb_array_length(questions_snapshot) > 0),
  result_snapshot jsonb
    CHECK (result_snapshot IS NULL OR jsonb_typeof(result_snapshot) = 'object'),
  status text NOT NULL CHECK (status IN (
    'IN_PROGRESS', 'PASS', 'PASS_WITH_CORRECTIONS', 'RETAKE_REQUIRED'
  )),
  start_interaction_id text NOT NULL UNIQUE
    CHECK (start_interaction_id ~ '^[0-9]{17,20}$'),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  FOREIGN KEY (practical_class_id, discord_user_id)
    REFERENCES ballet_classes (class_id, discord_user_id) ON DELETE RESTRICT,
  UNIQUE (discord_user_id, target_stage_id, attempt_number),
  UNIQUE (attempt_id, discord_user_id),
  CHECK ((status = 'IN_PROGRESS') = (completed_at IS NULL)),
  CHECK ((status = 'IN_PROGRESS') = (result_snapshot IS NULL))
);

CREATE UNIQUE INDEX academy_assessment_one_active_per_user_idx
  ON academy_assessment_attempts (discord_user_id)
  WHERE status = 'IN_PROGRESS';

CREATE INDEX academy_assessment_user_history_idx
  ON academy_assessment_attempts (discord_user_id, started_at DESC, attempt_id);

CREATE FUNCTION protect_academy_assessment_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Completed Academy assessment attempts are immutable';
  END IF;
  IF NEW.attempt_id <> OLD.attempt_id
     OR NEW.discord_user_id <> OLD.discord_user_id
     OR NEW.source_stage_id <> OLD.source_stage_id
     OR NEW.target_stage_id <> OLD.target_stage_id
     OR NEW.attempt_number <> OLD.attempt_number
     OR NEW.practical_class_id <> OLD.practical_class_id
     OR NEW.practical_review_snapshot <> OLD.practical_review_snapshot
     OR NEW.questions_snapshot <> OLD.questions_snapshot
     OR NEW.start_interaction_id <> OLD.start_interaction_id
     OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'Academy assessment evidence snapshots are immutable';
  END IF;
  IF NEW.status = 'IN_PROGRESS' OR NEW.completed_at IS NULL OR NEW.result_snapshot IS NULL THEN
    RAISE EXCEPTION 'Academy assessment updates must complete the saved attempt';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academy_assessment_attempt_completion_only
BEFORE UPDATE ON academy_assessment_attempts
FOR EACH ROW
EXECUTE FUNCTION protect_academy_assessment_attempt();

CREATE TRIGGER academy_assessment_attempts_no_delete
BEFORE DELETE ON academy_assessment_attempts
FOR EACH ROW
EXECUTE FUNCTION reject_academy_assessment_history_mutation();

CREATE TRIGGER academy_assessment_attempts_no_truncate
BEFORE TRUNCATE ON academy_assessment_attempts
FOR EACH STATEMENT
EXECUTE FUNCTION reject_academy_assessment_history_mutation();

CREATE TABLE academy_assessment_actions (
  interaction_id text PRIMARY KEY
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('START', 'ANSWER')),
  request_fingerprint char(64) NOT NULL
    CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (attempt_id, discord_user_id)
    REFERENCES academy_assessment_attempts (attempt_id, discord_user_id) ON DELETE RESTRICT
);

CREATE INDEX academy_assessment_actions_user_history_idx
  ON academy_assessment_actions (discord_user_id, created_at DESC);

CREATE TABLE academy_assessment_responses (
  attempt_id uuid NOT NULL,
  discord_user_id text NOT NULL,
  question_id text NOT NULL CHECK (question_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  interaction_id text NOT NULL UNIQUE
    CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  answer_id text NOT NULL CHECK (answer_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (attempt_id, question_id),
  FOREIGN KEY (attempt_id, discord_user_id)
    REFERENCES academy_assessment_attempts (attempt_id, discord_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (interaction_id)
    REFERENCES academy_assessment_actions (interaction_id) ON DELETE RESTRICT
);

CREATE INDEX academy_assessment_responses_user_history_idx
  ON academy_assessment_responses (discord_user_id, answered_at DESC);

CREATE TABLE academy_assessment_promotions (
  attempt_id uuid PRIMARY KEY,
  discord_user_id text NOT NULL,
  source_stage_id text NOT NULL
    CHECK (source_stage_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  target_stage_id text NOT NULL
    CHECK (target_stage_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  promoted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (attempt_id, discord_user_id)
    REFERENCES academy_assessment_attempts (attempt_id, discord_user_id) ON DELETE RESTRICT,
  UNIQUE (discord_user_id, target_stage_id)
);

CREATE INDEX academy_assessment_promotions_user_history_idx
  ON academy_assessment_promotions (discord_user_id, promoted_at DESC);

CREATE TRIGGER academy_assessment_actions_append_only
BEFORE UPDATE OR DELETE ON academy_assessment_actions
FOR EACH ROW
EXECUTE FUNCTION reject_academy_assessment_history_mutation();

CREATE TRIGGER academy_assessment_actions_no_truncate
BEFORE TRUNCATE ON academy_assessment_actions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_academy_assessment_history_mutation();

CREATE TRIGGER academy_assessment_responses_append_only
BEFORE UPDATE OR DELETE ON academy_assessment_responses
FOR EACH ROW
EXECUTE FUNCTION reject_academy_assessment_history_mutation();

CREATE TRIGGER academy_assessment_responses_no_truncate
BEFORE TRUNCATE ON academy_assessment_responses
FOR EACH STATEMENT
EXECUTE FUNCTION reject_academy_assessment_history_mutation();

CREATE TRIGGER academy_assessment_promotions_append_only
BEFORE UPDATE OR DELETE ON academy_assessment_promotions
FOR EACH ROW
EXECUTE FUNCTION reject_academy_assessment_history_mutation();

CREATE TRIGGER academy_assessment_promotions_no_truncate
BEFORE TRUNCATE ON academy_assessment_promotions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_academy_assessment_history_mutation();
