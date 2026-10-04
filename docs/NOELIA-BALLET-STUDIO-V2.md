# Noélia Ballet Studio V2 — Maison Noélia

Status: **In Development**. This file is the technical source of truth for the
Academy gameplay phase. “Implemented” below means present in this repository;
it does not imply that the feature has been deployed or released.

## Product vision

Maison Noélia — Académie de Ballet is Noélia’s fictional ballet-academy and
career-RPG setting. It is an original game system inspired by ballet education;
it is not an official, affiliated, or certified RAD or other real-world
academy. The fictional Académie de Ballet Noélia remains the heart of the
Maison after its curriculum expanded into conditioning, theory, musicality,
French ballet vocabulary, history, repertoire, and performance.

## Architecture and domain boundaries

Noélia is a TypeScript/Eris application backed by PostgreSQL. PostgreSQL remains
the source of truth for persistent state. Commands and embeds adapt Discord
interactions to domain services; profile is a read-only aggregator. Gameplay
decisions must be complete before persona generation. Persona may render
dialogue and flavor, but cannot mutate or decide progression, rewards,
permissions, cooldowns, RNG, or database state.

Academy, Ballet training, performance, knowledge, wardrobe, economy, pets,
relationships, settings, persona, and presentation have separate ownership.
They may read one another through explicit service boundaries, but must not
duplicate wallet, inventory, profile, or Academy truth. Discord interaction IDs
remain idempotency keys for mutations. SQL remains parameterized.

## Academy progression

**Implemented:** a canonical ordered 19-stage curriculum is derived from the
existing Ballet level, activity completion history, six Ballet stats, best
performance tiers, and selected completed Knowledge lessons. It does not
create a second XP or rank store. Knowledge gates read immutable completions
from the Knowledge domain and show missing lesson requirements explicitly.
Every stage after the entry stage requires evidence beyond level alone. The order is:

1. Pre-School Dance
2. Preparatory Dance
3. Pre-Primary
4. Primary
5. Grade 1
6. Grade 2
7. Grade 3
8. Grade 4
9. Grade 5
10. Grade 6
11. Grade 7
12. Grade 8
13. Discovering Repertoire
14. Intermediate Foundation
15. Intermediate
16. Advanced Foundation
17. Advanced 1
18. Advanced 2
19. Solo Seal

`src/ballet/academy.ts` is the centralized curriculum and contains the current
initial gameplay thresholds, including Knowledge lesson counts. These are
**provisional balancing defaults**, not final educational standards. Before
Assessment V1, stage was derived only from evidence. With additive migration
023, the first guided class or assessment start records the user's then-current
derived stage as a persistent baseline; subsequent advancement is controlled by
one-stage-at-a-time assessment promotion. The existing result property names
`currentRank`/`nextRank` are retained for compatibility while consumers migrate
to stage terminology.

## Training and preparation

**Implemented:** existing Ballet activities and /ballet practice remain
unchanged. /ballet class starts or resumes a persistent session whose
versioned curriculum snapshot depends on the user's derived Academy stage and
selected class type. Barre, Centre, Technique, Conditioning, Turns, Allegro,
Adagio, and original fictional Repertoire sections are filtered by centralized
stage gates.

Preparation is saved per session and remains optional. Missing preparation
never blocks class; its relation to an exercise is part of the saved attempt
calculation. The class stores its stage snapshot, type, status, current section
and index, marked preparation, completed attempts, correction history, and
final review. A unique active-class constraint and user row lock prevent
concurrent sessions from branching.

## Class performance outcomes

**Implemented for classes:** each new exercise attempt gets one injected
random roll. A centralized engine combines it with the exercise difficulty,
weighted values from the existing six Ballet stats, and the session's
preparation. PERFECT/SUCCESS/SHAKY/FAIL, score, roll, stat snapshot,
preparation snapshot, and any structured correction are saved transactionally
with the Discord interaction idempotency record. Retries, reads, class resume,
and review never roll again. A stale button cannot attempt a different
exercise.

The existing /performance command remains deterministic and retains its fixed
stat score and reward rules. Class RNG is separate and awards no XP, currency,
or stat gains. Its initial calibration lives centrally in
src/ballet/class/performance.ts and is provisional game tuning, not real
training guidance.

**Class review:** the final review is derived from persisted attempts and
summarizes sections, scores, and repeated correction categories. It adds
training evidence to the existing Academy query; it does not create another
progression or replace Knowledge/activity/performance evidence. Assessment
Preparation is a class type, not a formal stage assessment.

## Training skills, condition, cycles, and setbacks

**Implemented in application code; migration 024 and PostgreSQL verification
are pending.** The original six persistent Ballet stats remain unchanged. A
separate set of eight gameplay skills (balance, core control, footwork,
coordination, turn control, jump control, placement, and musicality) uses
centralized exercise-family weights. Perfect/successful class attempts and
successful `/ballet practice` completions may grant bounded skill evidence;
failed or shaky class attempts do not grant skill points. A five-event rolling
24-hour limit prevents rapid farming. Skill snapshots, class results, skill
events, and stamina workload events share the surrounding interaction
transaction and replay boundary.

Stamina cycles are separate from the existing Stamina stat. The first target
is six completed exercise/practice workloads with a seven-day deadline.
Subsequent targets are centrally generated from the prior completed workload,
with a normal `ceil(previous workload * 0.5)` floor, a maximum of 20, and the
existing named `0.0001%` below-floor exception. Expired cycles are displayed as
expired on reads without writes; the next valid training mutation records the
expiry and opens the next cycle atomically. This is not a rolling seven-day
window.

The separate fictional condition snapshot tracks energy, nutrition, fatigue,
and sleep debt. It recovers deterministically on elapsed whole hours when read
or used; REST, SLEEP, NOURISH, and REHABILITATE are idempotent recovery actions
with a configured cooldown. A rare, game-only training setback can occur after
a failed attempt at high fictional fatigue and records its triggering attempt
and required recovery sessions. These labels and numbers are game mechanics,
not health, nutrition, sleep, injury, or professional training guidance.
No medical condition, real injury, or individual readiness is assessed.

The optional `/wardrobe fit` profile stores a fictional EU shoe-size and
catalog-fit preference for display only. It does not validate, recommend, or
claim physical shoe fit and does not affect equipping or Academy requirements.

## Knowledge and courses

**Implemented (Knowledge V1):** eight separate domains—Musicality, Ballet
French, Ballet Theory, Ballet History, French History & Culture, Academy
History, Repertoire Studies, and Academy Etiquette—with three introductory
lessons per domain. `/learn browse`, `/learn read`, `/learn answer`, and
`/learn progress` provide the initial workflow. A correct first answer grants centralized
Knowledge points; wrong answers can be retried without a penalty. Each attempt
is keyed by Discord interaction ID and recorded transactionally. Completion
history is append-only; domain points are derived from completed lessons, not a
second mutable counter. `/profile` aggregates Knowledge read-only. Migration
021 is additive. XP, wallet/currency, and Ballet stats are not changed by
lessons.

**Implemented in application code / deployment not verified:** `/academy assessment`
reports canonical requirement progress, uses a completed saved
class review and a question snapshot from the existing Knowledge catalog, and
stores replay-safe attempts. Passing results promote one stage; a failed result
requires a new current-stage class before retake. A one-time immutable legacy
baseline preserves the stage an existing user had reached. Migration 023 is
additive and has not been applied to Production. See
`docs/architecture/academy-assessments.md`. Larger course catalogs and richer
Knowledge interactions remain planned. Current reward and lesson content are
initial defaults, not final curriculum balance.

**Implemented (content only):** `src/ballet/academy-history.ts` contains seven
fictional Academy-history chapters. It is separate from gameplay rules and is
not yet exposed as a lesson/command workflow.

## Madame Noélia: class feedback

**Implemented:** exercise outcome and correction are domain facts; the Ballet
presentation layer supplies concise class tone after the transaction. The
review draws only from saved session context. Persona text cannot choose an
exercise, change a score, or alter progression.

**Implemented in application code:** saved V3 attempt effects give the class
review an auditable boundary between the performance result and a separate
fictional condition/setback result. Madame's presentation remains downstream
of these domain results. Corrections target an exercise result, not a player's
worth. Persistent teacher Mood/Patience remains planned.

## Character age boundary

There is no Academy Character Age system. No age field, age progression,
age-based shop rule, or age-dependent Persona exists. Academy stages are
progression labels only and do not express a real or fictional numeric age.

## Wardrobe and economy

**Implemented (existing):** shared shop catalog, wallet/ledger, inventory,
equipment, presets, collections, and Academy uniform validation based on
actually equipped items. Permanent starter-uniform items are deterministically
obtainable. Pointe shoes are not required for beginner work; ballet flats and
pointe shoes use the existing exclusive shoe slot. Rank styling is cosmetic.

**Planned:** broader classwear/training/gymnastics/performance categories and
structured brand/collection/design/colorway/Academy metadata. Designs must be
original and rarity cannot create automatic gameplay power. Never add a second
wallet, inventory, or catalog truth.

## Pets and relationships

**Pets: Planned/Not implemented.** Optional social/care/RP only. Needs decay
slowly; neglect cannot kill/remove a pet. Random pet events cannot permanently
destroy items. Pets do not buff XP, currency, Stamina, or performance.

**Relationships: Implemented (existing separate domain).** Marriage/relationship
state is not an Academy prerequisite. Any future encouragement reward must be
optional, bounded, and idempotent; values and chance remain TBD.

## Professional career boundary

Solo Seal is the final Academy stage, not the end of the game. A future
professional career (for example Trainee, Corps de Ballet, Soloist, Première /
Étoile) must be a separate progression domain. It is not implemented; there is
no level-999 continuation.

## RNG, transaction, and migration invariants

- No persona/LLM decides domain outcomes.
- Mutations and their idempotency/audit rows commit atomically.
- Retry of a committed Discord interaction returns its stored result.
- A read never rolls or changes prior outcomes.
- PostgreSQL remains the only persistent source of truth.
- Applied migrations are immutable; schema evolution is additive and
  forward-only.
- Production databases are never used for development tests or migration runs.

The canonical derived curriculum and fictional-history content needed no
database migration. Knowledge V1 added migration 021. The persistent class
engine added migration 022, Academy Assessments added migration 023, and the
separate V3 skill/condition/cycle/setback/action history adds forward-only
migration 024. Migrations 001–023 remain immutable. Migration 024 is not
verified against PostgreSQL and has not been applied to Production.

## Testing strategy

Unit tests cover stage ordering, assessment eligibility/results/components,
class gating, preparation scoring, difficulty and skill-score direction,
fixed outcome boundaries, correction aggregation, V3 condition recovery,
workload and skill rules, and the Ballet/wardrobe command paths. PostgreSQL
integration tests also cover class-result replay across service restart, one
set of V3 effects per interaction, persisted cycle/skill/condition state,
recovery cooldown/replay, and the fictional shoe profile. They run only with an
explicitly isolated test database; those database tests still require the
repository's guarded PostgreSQL test setup. The full quality gate is
`npm run check`; in constrained Windows workers Vitest may disable isolate/file
parallelism without changing test assertions.

## TBD balancing and follow-up blocks

- Further review of provisional promotion thresholds; Assessment V1 adds no
  XP, Knowledge-point, wallet, or training-stat rewards.
- Further balance review of the centralized class score calibration.
- Further balance review of V3 skill weights, condition costs, cycle targets,
  and recovery cooldowns; all current numbers are centralized provisional
  game tuning.
- Isolated PostgreSQL execution of migration 024 and its integration tests.
- Safe player-facing UI for longer-term setback history and equipment cosmetics.
- Teacher mood durations, patience changes, corrective caps.
- Pet needs/decay and optional social encouragement parameters.
- Settings hierarchy and privacy defaults.
- More lesson content, course unlocks, and deeper Knowledge course progression.
- Wiki transfer and any product-release status.
