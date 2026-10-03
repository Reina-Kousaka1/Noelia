# Performance & RNG

**Status: Deterministic performance implemented; stochastic performance engine planned.**

The current performance score is a weighted average of Ballet stats, with
fixed tier cutoffs and rewards. Attempts, cooldown, wallet, XP, and history are
transactional and replay-safe; a read does not reroll. The planned engine adds
preparation and exercise-specific weights with stored outcome/RNG audit data.
Persona must never decide or alter a roll. See `src/performance/` and the
technical source of truth.
