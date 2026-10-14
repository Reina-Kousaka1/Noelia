-- Extend the existing V3 workload cycles into durable weekly Preparation plans.
-- Existing cycles and game stats remain intact; older rows receive a neutral
-- seven-day duration and no fabricated RNG/finalization history.
ALTER TABLE ballet_stamina_cycles
  DROP CONSTRAINT ballet_stamina_cycles_target_workload_check;

ALTER TABLE ballet_stamina_cycles
  ADD CONSTRAINT ballet_stamina_cycles_target_workload_check
    CHECK (target_workload BETWEEN 1 AND 70),
  ADD COLUMN duration_days smallint NOT NULL DEFAULT 7
    CHECK (duration_days BETWEEN 1 AND 42),
  ADD COLUMN floor_roll_micros integer
    CHECK (floor_roll_micros BETWEEN 0 AND 999999),
  ADD COLUMN target_roll_micros integer
    CHECK (target_roll_micros BETWEEN 0 AND 999999),
  ADD COLUMN carryover_from_cycle_number integer,
  ADD COLUMN cycle_outcome text
    CHECK (cycle_outcome IN ('WEEKLY_GOAL_COMPLETED', 'WEEKLY_GOAL_MISSED')),
  ADD COLUMN finalized_at timestamptz,
  ADD COLUMN stamina_delta smallint
    CHECK (stamina_delta BETWEEN 0 AND 2);

ALTER TABLE ballet_training_condition
  ADD COLUMN consistency_stamina smallint NOT NULL DEFAULT 100
    CHECK (consistency_stamina BETWEEN 0 AND 150);

ALTER TABLE ballet_class_attempts
  ADD COLUMN preparation_failure_roll_micros integer
    CHECK (preparation_failure_roll_micros BETWEEN 0 AND 999999),
  ADD COLUMN preparation_failure_probability_micros integer
    CHECK (preparation_failure_probability_micros BETWEEN 0 AND 650000),
  ADD COLUMN preparation_failure_triggered boolean,
  ADD COLUMN preparation_failure_streak smallint NOT NULL DEFAULT 0
    CHECK (preparation_failure_streak BETWEEN 0 AND 100),
  ADD COLUMN preparation_reason_code text
    CHECK (preparation_reason_code IN (
      'PREPARED', 'PARTIALLY_PREPARED', 'UNPREPARED', 'REPEATED_PREPARATION_FAILURE'
    )),
  ADD COLUMN preparation_status text
    CHECK (preparation_status IN ('PREPARED', 'PARTIALLY_PREPARED', 'UNPREPARED'));

CREATE INDEX ballet_class_attempts_user_recent_idx
  ON ballet_class_attempts (discord_user_id, attempted_at DESC, attempt_id DESC);

CREATE INDEX ballet_stamina_cycles_finalization_idx
  ON ballet_stamina_cycles (deadline_at)
  WHERE status = 'ACTIVE';
