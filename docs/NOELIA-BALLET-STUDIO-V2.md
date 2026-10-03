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
existing Ballet level, activity completion history, six Ballet stats, and best
performance tiers. It does not create a second XP or rank store. Every stage
after the entry stage requires evidence beyond level alone. The order is:

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
initial gameplay thresholds. These are **provisional balancing defaults**,
not final educational standards. Stage is derived, not yet a persisted
assessment/promotion decision. The existing result property names
`currentRank`/`nextRank` are retained for compatibility while consumers migrate
to stage terminology.

## Training and preparation

**Implemented (existing):** class, barre, center practice, stretching,
technique, pointe practice, rehearsal, choreography, performance, audition,
recital, and showcase. Existing practice transactions atomically record XP,
stats, wallet reward, and cooldown under the Discord interaction ID.

**Planned:** expanded exercise catalog (including gymnastics/conditioning),
preparation steps, and an attempt flow where incomplete preparation affects
the chance of an outcome but never prevents an attempt by itself. Conditioning
is intended as core gameplay, not a guild-disableable feature.

## Performance and RNG

**Implemented (existing):** deterministic weighted Ballet-stat scoring, fixed
tiers/rewards, cooldowns, immutable history, and transaction-safe replay. Reads
never reroll a completion.

**Planned:** an auditable, bounded and testable RNG performance engine with
PERFECT/SUCCESS/SHAKY/FAIL outcomes and preparation, stamina, difficulty, and
exercise-specific skill weights. Outcome snapshot and RNG evidence must be
persisted atomically before this replaces deterministic scoring. No pay-to-win
equipment effect or persona-controlled roll is allowed.

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

**Planned:** independently persisted knowledge domains: Musicality, Ballet
French, Ballet Theory, Ballet History, French History & Culture, Academy
History, Repertoire Studies, and Academy Etiquette. Lessons, quiz attempts,
completion and rewards need idempotent PostgreSQL transactions. Knowledge is
not Ballet XP and does not automatically grant stat bonuses.

**Implemented (content only):** `src/ballet/academy-history.ts` contains seven
fictional Academy-history chapters. It is separate from gameplay rules and is
not yet exposed as a lesson/command workflow.

## Madame Noélia: mood, patience, corrective training

**Implemented (existing):** bounded persona presentation with a safe fallback;
the persona receives allowlisted facts only.

**Planned:** persisted teacher Mood and per-session Patience, neutral domain
events, correction tracking and bounded corrective-training plans. Mood may
affect dialogue/session choices but never the already-defined performance
roll. Corrective work must be bounded and must never multiply normal cycle or
Academy requirements. Critique targets execution, not a player’s worth.

## Academy Character Age and settings

**Planned/Not implemented:** optional, explicitly fictional
`academy_character_age`/age-band setting only. It is not a Discord user’s age;
the bot must not request, infer, or import real age. Disabled or private means
the value is omitted from display and persona context. Academy gameplay must
not depend on it. No centralized Global Default → Guild Override → User
Preference SettingsManager exists yet; core Academy/training rules are not
feature flags.

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

No database migration was needed for the canonical derived curriculum and lore
content in this block.

## Testing strategy

Unit tests cover stage ordering, combined evidence requirements, entry-stage
semantics, advanced pointe gating, Solo Seal’s terminal boundary, and fictional
history content. PostgreSQL integration tests cover query-backed progression
and transactional gameplay; they run only with an explicitly isolated test
database. The full quality gate is `npm run check`; in constrained Windows
workers the equivalent Vitest invocation may disable isolate/file parallelism
without changing test assertions.

## TBD balancing and follow-up blocks

- Final promotion thresholds, assessment structure, XP/Knowledge rewards.
- Preparation penalties and performance probability curves.
- Stamina cycle workload/deadline bands and caps.
- Teacher mood durations, patience changes, corrective caps.
- Pet needs/decay and optional social encouragement parameters.
- Settings hierarchy and privacy defaults.
- Lesson catalog, course unlocks, quizzes, and promotion integration.
- Wiki transfer and any product-release status.
