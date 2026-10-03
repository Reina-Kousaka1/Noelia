CREATE TABLE academy_lesson_attempts (
  interaction_id text PRIMARY KEY CHECK (interaction_id ~ '^[0-9]{17,20}$'),
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  lesson_id text NOT NULL CHECK (lesson_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  domain text NOT NULL CHECK (domain IN (
    'musicality', 'ballet_french', 'ballet_theory', 'ballet_history',
    'french_history_culture', 'academy_history', 'repertoire_studies',
    'academy_etiquette'
  )),
  answer_id text NOT NULL CHECK (answer_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('CORRECT', 'INCORRECT', 'ALREADY_COMPLETED')),
  points_awarded integer NOT NULL CHECK (points_awarded >= 0),
  points_after integer NOT NULL CHECK (points_after >= 0),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (outcome = 'CORRECT' AND points_awarded > 0) OR
    (outcome IN ('INCORRECT', 'ALREADY_COMPLETED') AND points_awarded = 0)
  )
);

CREATE TABLE academy_lesson_completions (
  discord_user_id text NOT NULL
    REFERENCES discord_users (discord_user_id) ON DELETE RESTRICT,
  lesson_id text NOT NULL CHECK (lesson_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  domain text NOT NULL CHECK (domain IN (
    'musicality', 'ballet_french', 'ballet_theory', 'ballet_history',
    'french_history_culture', 'academy_history', 'repertoire_studies',
    'academy_etiquette'
  )),
  completion_interaction_id text NOT NULL UNIQUE
    REFERENCES academy_lesson_attempts (interaction_id) ON DELETE RESTRICT,
  points_awarded integer NOT NULL CHECK (points_awarded > 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_user_id, lesson_id)
);

CREATE INDEX academy_lesson_attempt_user_history_idx
  ON academy_lesson_attempts (discord_user_id, attempted_at DESC, interaction_id DESC);

CREATE FUNCTION validate_academy_lesson_completion_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM academy_lesson_attempts AS attempt
    WHERE attempt.interaction_id = NEW.completion_interaction_id
      AND attempt.discord_user_id = NEW.discord_user_id
      AND attempt.lesson_id = NEW.lesson_id
      AND attempt.domain = NEW.domain
      AND attempt.outcome = 'CORRECT'
      AND attempt.points_awarded = NEW.points_awarded
  ) THEN
    RAISE EXCEPTION 'Academy lesson completion must reference its correct answer attempt';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academy_lesson_completions_valid_attempt
BEFORE INSERT ON academy_lesson_completions
FOR EACH ROW
EXECUTE FUNCTION validate_academy_lesson_completion_attempt();

CREATE FUNCTION reject_academy_lesson_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Academy lesson history is immutable';
END;
$$;

CREATE TRIGGER academy_lesson_attempts_append_only
BEFORE UPDATE OR DELETE ON academy_lesson_attempts
FOR EACH ROW
EXECUTE FUNCTION reject_academy_lesson_history_mutation();

CREATE TRIGGER academy_lesson_attempts_no_truncate
BEFORE TRUNCATE ON academy_lesson_attempts
FOR EACH STATEMENT
EXECUTE FUNCTION reject_academy_lesson_history_mutation();

CREATE TRIGGER academy_lesson_completions_append_only
BEFORE UPDATE OR DELETE ON academy_lesson_completions
FOR EACH ROW
EXECUTE FUNCTION reject_academy_lesson_history_mutation();

CREATE TRIGGER academy_lesson_completions_no_truncate
BEFORE TRUNCATE ON academy_lesson_completions
FOR EACH STATEMENT
EXECUTE FUNCTION reject_academy_lesson_history_mutation();
