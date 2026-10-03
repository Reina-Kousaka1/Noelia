# Performance & RNG

**Status: Performance command remains deterministic; Ballet class attempts
have a separate persisted stochastic result.**

The existing /performance domain uses its fixed stat-weighted score, tier
cutoffs, rewards, cooldowns, and immutable history. It does not use random
outcomes and is unchanged by the class engine.

Within a Ballet class, each new exercise attempt uses one random roll combined
with the exercise difficulty, weighted values from the existing six Ballet
stats, and preparation recorded for that session. The resulting PERFECT,
SUCCESS, SHAKY, or FAIL score is written before Discord renders it. The roll,
stat snapshot, readiness snapshot, and correction are persisted with the
attempt and its interaction key.

Retrying the same interaction returns its stored result. Viewing, refreshing,
or resuming a class never rolls again. A distinct valid attempt for the
current exercise receives a new roll. The class review is derived from saved
results and has no random step.

The initial numeric calibration is centralized in
src/ballet/class/performance.ts and is provisional game tuning. No persona
provider chooses exercises, corrections, outcomes, or rewards. These fictional
results are not a real training assessment.
