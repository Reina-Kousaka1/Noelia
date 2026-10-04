# Academy Assessments V1

Academy Assessments connect the canonical 19-stage curriculum to the existing
Ballet Class and Knowledge systems. This is an implementation milestone; it is
not a claim that the migration or command has been deployed.

## Stage ownership and legacy compatibility

`src/ballet/academy.ts` remains the only stage catalog and requirement source.
`minis-bambinis` is a legacy persisted ID that resolves to canonical
`pre-school-dance`. `preparatory-dance` remains the second canonical stage.
Stored baselines, snapshots, and audit history are not rewritten. Queries for
Pre-School Dance include both its canonical ID and the legacy ID so historical
classes and assessment evidence remain usable.
The evidence-only resolver remains available for users whose assessment-stage
baseline has not yet been captured. On the first guided class or assessment
start after migration 023, the application stores that user's then-current
evidence-derived stage as an immutable legacy baseline and as their current
stage. Existing users therefore keep the stage the old resolver displayed.

After that baseline exists, progression is assessment-controlled. The next
stage is always the next entry in the canonical curriculum; a stage is never
skipped. Solo Seal is terminal. The next-stage requirements reuse the
curriculum's existing Ballet level, activity, stat, Knowledge lesson, and
performance evidence. The service reports every requirement and also requires
a completed Ballet Class at the current stage.

## Attempt flow

`/academy assessment` is read-only. It shows the current stage, target stage,
each fulfilled or missing requirement, a recent result, and a start button only
when eligible. Start and answer buttons are handled by the interaction router
and call the assessment domain service.

Each assessment snapshots the selected completed class review and one existing
Knowledge question per required Knowledge domain. A stage without a configured
Knowledge domain uses an existing Ballet Theory question. Questions and their
correct answer IDs are snapshotted; public views omit correct answer IDs and
explanations. Assessment questions do not call the lesson-answer service and
award no Knowledge points.

The Practical section reuses the already-completed class review. It does not
roll another exercise result. The result resolver reads only the frozen
Practical review and persisted Knowledge responses:

- `PASS` requires all Knowledge answers correct, all Practical sections rated
  Excellent, and no recorded primary correction.
- `PASS_WITH_CORRECTIONS` passes when those perfect conditions are not met but
  no Practical section needs attention and at least one Knowledge answer is
  correct.
- `RETAKE_REQUIRED` follows if no Knowledge answers are correct or a Practical
  section needs attention.

Both passing results promote exactly one stage. The terminal result, stage
update, append-only promotion record, and `ASSESSMENT_PASSED` training evidence
are committed in one PostgreSQL transaction. The stage update is conditional on
the saved source stage, while the Discord user's row lock serializes assessment
operations. The database also limits each user to one active attempt and one
promotion into any target stage.

## Idempotency and retakes

Discord interaction IDs are persistent action keys. Replaying the same start
or answer returns the saved attempt; it cannot create a new question roll,
response, result, or promotion. Attempts and answers survive process restarts.
Concurrent starts for one user resume the same active attempt.

A failed attempt remains in history and does not change the stage. A retake is
available after a new completed class at the unchanged current stage. There is
no time penalty and no reroll-until-pass path using the old Practical evidence.
The next attempt uses the next deterministic question rotation from the
existing Knowledge catalog.

## Presentation boundary

The domain decides eligibility, selected evidence, answers, result, and
promotion. The existing Persona presentation may phrase the assessment screen
and result, but does not make or change any of those decisions. No credits,
wallet changes, XP, or new training stats are awarded. `/ballet practice`,
`/ballet class`, and `/learn` remain available and retain their existing
behavior.

## Persistence

Migration `023_academy_assessments_v1.sql` is additive. It adds an assessment
stage pointer with an immutable legacy baseline, frozen attempts, action and
answer idempotency records, and append-only promotion history. It does not
rewrite old activity, Knowledge, or Ballet Class records. Do not apply it to a
production database as part of this implementation review; use the repository's
isolated PostgreSQL integration-test guard for database verification.

The separate Ballet Training V3 domain (migration 024) is outside Assessment
V1. Its skills, game-only condition, workload cycles, fictional setbacks and
recovery audit, and display-only shoe preference do not satisfy assessment
requirements unless a future additive evidence rule explicitly says so. V3
visual banners remain a later presentation task.
