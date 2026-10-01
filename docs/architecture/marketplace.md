# Marketplace boundary (planned)

Status: architecture prepared; marketplace commands, schema, and trading are
not implemented.

## Ownership and persistence

PostgreSQL remains the only source of truth. The marketplace will be a separate
domain that composes the existing inventory and economy ports; it must not
write their tables through Discord handlers or introduce a second inventory or
wallet. Shop purchases remain distinct from user-to-user listings.

## Required invariants

- A listing references inventory the seller owns and can actually offer.
- Listing creation moves the offered quantity into persistent escrow in the
  same transaction as creating the listing. Escrow is not spendable inventory.
- Cancellation returns escrow to its original owner atomically; a sold or
  already-cancelled listing cannot be cancelled a second time.
- Purchase locks the listing, checks that it is active and not owned by the
  buyer, then transfers the item and Ballet Slippers in one transaction.
- Buyer debit, seller credit, both ledger entries, inventory transfer, sale
  record, escrow release, and listing state change commit or roll back together.
- Amounts use integer `bigint` units. No floating-point prices or direct wallet
  balance edits are permitted.
- Every mutating Discord action stores its interaction ID as an idempotency
  key. A replay returns the original result and never repeats the transfer.
- Concurrent attempts against one listing serialize on its row; multi-wallet
  locks are acquired in deterministic user-ID order to avoid deadlocks.
- A seller cannot buy their own listing. Validation and authorization happen
  before any irreversible external side effect; the database transaction is
  the authority for ownership and availability.

## Future persistence shape

When marketplace implementation is approved, introduce fresh versioned
migrations for listings, escrow, and completed trades. Use foreign keys to
existing Discord-user and inventory identities, explicit listing states, a
unique interaction/idempotency constraint, and checks that reject non-positive
quantities or prices. Keep completed trade and wallet-ledger records
append-only. Do not retrofit old schemas or move data from an archived bot.

## Application boundary

The future `marketplace` domain should expose a testable service/port for
create-listing, cancel-listing, browse, and purchase operations. Discord
commands should only parse input, defer/respond, and call that port. Rendering
and persona copy stay outside the service. Integration tests must use the
isolated `noelia_test` database guard and cover rollback, replay, concurrent
purchase, insufficient balance, cancellation, and escrow ownership.

No marketplace tables or service are created by this architecture note.
