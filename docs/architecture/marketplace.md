# Marketplace V1

Status: Marketplace V1 persistence and `/market` commands are implemented.
Listings, escrow, request idempotency, two-sided wallet transfers, and sale
history are stored in PostgreSQL migration V7.

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

Migration V7 implements fresh listing, escrow, request, and sale tables with
foreign keys to existing Discord-user and catalog identities, explicit listing
states, interaction/idempotency constraints, checks for positive quantities and
prices, and append-only sale history. The service retains completed listings
and ledger records; it does not retrofit old schemas or import data.

## Application boundary

The `marketplace` domain exposes a testable service/port for create-listing,
cancel-listing, browse, mine, and purchase. `/market` only parses input,
defers/responds, and calls that port; rendering and persona copy stay outside
the service. PostgreSQL integration tests use the isolated `noelia_test`
database guard and cover rollback, replay, concurrent purchase, insufficient
balance, cancellation, and escrow ownership.

Only the seller can cancel in V1. Administrative cancellation, fees, auctions,
and any moderation-driven listing takedown are intentionally not implemented.
