# Technical Architecture

**Status: Existing architecture documented.**

Noélia uses TypeScript, Eris, PostgreSQL, parameterized SQL, and domain services
with Discord command adapters. PostgreSQL is the persistent source of truth.
Mutation results and idempotency records commit atomically. Applied migrations
are immutable; changes are additive/forward-only. Persona and presentation
cannot make domain decisions. See `docs/architecture/` and
`docs/NOELIA-BALLET-STUDIO-V2.md`.
