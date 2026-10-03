# Skills & Stamina

**Status: Existing six Ballet stats implemented; training-cycle system planned.**

Technique, Flexibility, Musicality, Performance, Pointe, and Stamina are stored
in `ballet_stats` and capped at 100. Stamina currently behaves like the other
stats; the planned cycle model is not live. Its initial value is specified as
100, with cycle workload/deadline and audited next-cycle generation. The normal
next-workload floor is half the completed workload rounded up; a below-floor
exception is exactly 1 in 1,000,000. Cycle bands remain TBD.
