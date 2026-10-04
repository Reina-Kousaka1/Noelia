# Skills & Stamina

**Status: Existing six stats and separate fictional Training V3 are in the
application; migration 024 still needs isolated PostgreSQL verification.**

Technique, Flexibility, Musicality, Performance, Pointe, and Stamina are stored
in `ballet_stats` and capped at 100. They remain unchanged. Training V3 adds
separate domain skills, a game-only condition state, stamina workload cycles,
and append-only interaction evidence. None of these values is a real-world
fitness, health, sleep, injury, or training assessment.

## Training V3 rules

- Eight exercise skills use centralized family weights and are capped at 100.
- Only successful practice and SUCCESS/PERFECT class attempts grant gains;
  gains are limited to five events per rolling 24 hours.
- Energy, nutrition, fatigue, and sleep debt are game-only metrics. Whole-hour
  passive changes are calculated deterministically; recovery actions have a
  centralized two-hour cooldown and are replay-safe.
- A stamina cycle begins with six workloads and a seven-day deadline. The next
  target uses the prior completed workload, a normal `ceil(previous * 0.5)`
  floor, and a cap of 20. Falling below that floor has a separate 1-in-1,000,000
  exception. This is a deadline-based cycle, not a rolling window.
- Expired cycles are presented as expired on reads. A later valid training
  mutation records the expiry and creates the next cycle transactionally.
- Rare setbacks are fictional, separate from performance outcomes, and can
  occur only after the configured failed-attempt/high-fatigue condition. They
  require two replay-safe recovery sessions in the current centralized rules.
- `/wardrobe fit` stores a fictional display preference only. It neither
  recommends real shoe sizing nor gates inventory/equipment.

Migration `024_ballet_training_v3.sql` is additive and not applied to
Production. Integration tests require the explicitly isolated database guard.
