# Achievements V1

Migration V12 adds a small seeded achievement catalog, append-only per-user
unlock records, and one optional featured badge per profile. Achievements have
no wallet rewards or gameplay bonuses.

Domain events award achievements inside the same PostgreSQL transaction as the
source action: Ballet practice and level milestones, performances, shop
purchases, wardrobe equipment, completed collections, and marketplace sales
and purchases. Collection completion counts inventory plus active escrow, so a
seller does not lose a collection milestone merely by listing an item. The
unique `(discord_user_id, achievement_id)` key makes concurrent or repeated
unlock attempts safe.

`AchievementService` lists catalog and unlock state and lets a user feature an
already-unlocked achievement or clear the selection. Feature changes use the
Discord interaction ID for idempotency. The profile will read the selected
badge as an aggregate; achievement state remains owned by this domain.

`/achievements list`, `/achievements feature`, and
`/achievements clear_featured` use private responses and show stable IDs for
the feature selection.
