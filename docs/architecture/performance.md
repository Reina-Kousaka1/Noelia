# Ballet performances

The performance catalog and its stat thresholds, score weights, level gates,
cooldowns, prerequisites, and fixed rewards live in PostgreSQL migration V9.
Stable performance IDs are exposed as Discord choices; changing a live seed
requires a new additive migration.

The score is the rounded weighted average of the listed persistent Ballet stats.
The catalog requires the configured minimum values before an attempt is allowed.
Tier cutoffs are fixed in `src/performance/scoring.ts` (Bronze below 55, Silver
55–74, Gold 75–89, Prima 90–100). There is no random roll, wager, or score-based
currency multiplier. Rewards are the catalog's fixed XP and Ballet Slippers.

`PerformanceService` locks the user's progression and stat rows, checks level,
equipment/activity prerequisites and cooldown, credits the existing wallet and
ledger, advances the existing XP progression, and appends the immutable result
in one PostgreSQL transaction. The Discord interaction ID is the idempotency
key; duplicate requests replay the original score/reward snapshot. The user
lock serializes concurrent performance attempts and makes the cooldown check
race-safe.

`/performance browse` shows the active catalog and eligibility,
`/performance attempt` runs an eligible entry, and `/performance history` reads
the persistent completion history. PostgreSQL integration tests cover a forced
mid-transaction failure and verify that the wallet, XP, and history all roll
back together.
