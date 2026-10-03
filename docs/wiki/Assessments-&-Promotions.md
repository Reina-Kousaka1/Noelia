# Assessments & Promotions

**Status: Implemented in application code; migration and production release are not verified.**

`/academy assessment` reports eligibility from the canonical stage
requirements, a completed current-stage Ballet Class review, and the existing
Knowledge lesson catalog. The assessment snapshots one practical class review
and stage-relevant Knowledge questions. It does not award Knowledge points,
XP, currency, or new stats.

`PASS` and `PASS_WITH_CORRECTIONS` promote exactly one canonical stage;
`RETAKE_REQUIRED` leaves the stage unchanged. A failed assessment requires a
new class at the current stage before a retake. Discord interaction IDs,
persisted answer snapshots, user row locks, unique active-attempt constraints,
and an append-only promotion record protect retries and concurrent requests.
Persona presentation cannot choose the result or promotion.

Migration 023 adds the assessment state. The first guided class or assessment
start stores the user's then-current evidence-derived rank as an immutable
legacy baseline, preserving existing displayed progress. No assessment
migration or command has been applied/deployed to Production as part of this
work. See [the technical design](../architecture/academy-assessments.md).
