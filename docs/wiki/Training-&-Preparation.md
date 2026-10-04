# Ballet Classes & Preparation

**Status: Persistent stage-aware classes and integrated fictional Training V3
are implemented in application code; migration 024 still needs isolated
PostgreSQL verification.**

/ballet class starts or resumes one saved session per Discord user.
/ballet practice remains available as the existing independent practice
workflow. A class snapshots the user's current Academy stage and its
stage-appropriate curriculum, so a restart or a repeated command cannot
replace its exercise sequence.

## Class flow

The first release supports Regular, Technique, Barre Focus, Centre Focus,
Turns, Allegro, Conditioning, Repertoire, and Assessment Preparation class
types. Their section plans and exercise definitions live in
src/ballet/class/catalog.ts. A selected plan is filtered by the canonical
19-stage Academy curriculum before the class snapshot is persisted. The legacy
`minis-bambinis` ID is normalized to Pre-School Dance when read.

The Discord flow uses preparation buttons, Begin Class, and Attempt Exercise.
Preparation is optional; missing areas never block a session. Marked areas are
saved and affect the corresponding exercise score. The class records its
current section and position, every attempt and result, stat/readiness
snapshots, corrections, and its final review.

## Exercises and results

Exercise definitions use Noélia's existing six persisted Ballet stats:
Technique, Flexibility, Musicality, Performance, Pointe, and Stamina. Each
exercise has a stable ID, family, section, difficulty, Academy-stage gate,
stat weights, preparation requirements, correction categories, and evidence
code. Training V3 adds separate family-weighted skills and condition modifiers;
it never replaces those six stats. These are original fictional gameplay
exercises, not a certified curriculum or professional training advice.

Each new attempt receives one injected random roll. The domain combines the
roll with the saved stat snapshot, difficulty, and preparation, then stores
PERFECT, SUCCESS, SHAKY, or FAIL with the score and roll evidence in the same
transaction as its idempotency record. A duplicate Interaction ID replays the
saved attempt; reads and refreshes do not roll again. A stale exercise button
cannot attempt the next exercise by accident.

SHAKY and FAIL attempts store a structured correction. When V3 is configured,
the same transaction also stores the skill/condition snapshot, one cycle
workload event, and a separate low-probability fictional setback result. An
interaction retry returns the saved attempt and does not advance any state.
The class review is
derived from saved attempts, summarizes section results, and ranks repeated
corrections. It does not roll or modify the user's stats, Ballet XP, wallet, or
inventory.

## Academy evidence and boundaries

Completed classes and sections add evidence to the existing Academy
progression query. The evidence can satisfy existing activity-code
requirements; it does not add a second XP or rank system and does not remove
existing Knowledge, activity, stat, or performance evidence.

The current `/ballet practice` reward, XP, and six-stat semantics are
unchanged; successful completions additionally report a V3 training workload
and skill event inside the same existing transaction. `/performance` remains
independent. Formal Academy assessments reuse saved class reviews and
Knowledge questions; see [Assessments & Promotions](Assessments-&-Promotions.md).
Game-only recovery actions, cycle history, fictional setbacks, and a display-only
shoe preference are described in [Skills & Stamina](Skills-&-Stamina.md).
There is no character-age field or age-based Academy logic.

Schema changes are additive in migrations 022–024. Existing migrations,
Ballet practice records, stats, Academy evidence, and production data are
preserved. Migration 024 has not been applied to Production.
