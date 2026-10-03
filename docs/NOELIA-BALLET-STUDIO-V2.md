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

**Implemented:** a canonical ordered 18-stage curriculum is derived from the
existing Ballet level, activity completion history, six Ballet stats, best
performance tiers, and selected completed Knowledge lessons. It does not
create a second XP or rank store. Knowledge gates read immutable completions
from the Knowledge domain and show missing lesson requirements explicitly.
Every stage after the entry stage requires evidence beyond level alone. The order is:

1. Minis & Bambinis
2. Pre-Primary
3. Primary
4. Grade 1
5. Grade 2
6. Grade 3
7. Grade 4
8. Grade 5
9. Grade 6
10. Grade 7
11. Grade 8
12. Discovering Repertoire
13. Intermediate Foundation
14. Intermediate
15. Advanced Foundation
16. Advanced 1
17. Advanced 2
18. Solo Seal

`src/ballet/academy.ts` is the centralized curriculum and contains the current
initial gameplay thresholds, including Knowledge lesson counts. These are **provisional balancing defaults**,
not final educational standards. Stage is derived, not yet a persisted
assessment/promotion decision. The existing result property names
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

## Stamina and training cycles

**Implemented (existing):** Stamina is one of the six persistent Ballet stats,
capped at 100 and raised through existing activities.

**Planned:** initial permanent Stamina value 100 for the new cycle model, cycle
workload, completion, deadline, outcome, next-cycle generation and audit data.
This is not a rolling seven-day window. The normal next-workload floor is
`ceil(previous completed workload * 0.5)`. Going below it is a separate exact
1-in-1,000,000 exception. Workload/deadline bands and caps remain TBD and must
be centralized. No cycle state or migration is implemented in this block.

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

**Planned:** larger course catalogs, richer interactions, and persisted
Academy assessments/promotions. Knowledge evidence participates in the
current derived-stage requirements. Current
reward and lesson content are initial defaults, not final curriculum balance.

**Implemented (content only):** `src/ballet/academy-history.ts` contains seven
fictional Academy-history chapters. It is separate from gameplay rules and is
not yet exposed as a lesson/command workflow.

## Madame Noélia: class feedback

**Implemented:** exercise outcome and correction are domain facts; the Ballet
presentation layer supplies concise class tone after the transaction. The
review draws only from saved session context. Persona text cannot choose an
exercise, change a score, or alter progression.

**Planned:** persistent teacher Mood/Patience and bounded corrective-training
plans. Corrections are structured session records now, but no Injury or
Rehabilitation system is implemented. Critique targets an exercise result,
not a player's worth.

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
engine adds only the forward-only migration 022; migrations 001–021 remain
immutable.

## Testing strategy

Unit tests cover stage ordering, class gating, preparation scoring, fixed
outcome boundaries, correction aggregation, component IDs, and the /ballet
class command path. PostgreSQL integration tests cover class creation/resume,
partial preparation, concurrent duplicate attempts, restart/replay without
rerolling, completion review, and Academy evidence. They run only with an
explicitly isolated test database. The full quality gate is npm run check; in
constrained Windows workers Vitest may disable isolate/file parallelism without
changing test assertions.

## TBD balancing and follow-up blocks

- Final promotion thresholds, assessment structure, XP/Knowledge rewards.
- Further balance review of the centralized class score calibration.
- Stamina cycle workload/deadline bands and caps.
- Teacher mood durations, patience changes, corrective caps.
- Pet needs/decay and optional social encouragement parameters.
- Settings hierarchy and privacy defaults.
- More lesson content, course unlocks, and Knowledge-based promotion/assessment
  integration.
- Wiki transfer and any product-release status.
