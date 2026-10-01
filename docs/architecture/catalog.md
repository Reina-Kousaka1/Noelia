# Shop catalog, rarity, and collections V2

Migration V10 adds normalized `shop_collections` and `shop_item_collections`
tables, then links the original Phase-1 shop items to stable collection IDs.
Migration V14 adds the Beauty category and 30 original Balletcore pieces,
bringing the catalog to 92 items across eleven collections. Existing catalog,
inventory, purchase history, and wallet rows are preserved; catalog changes are
additive.

Migration V17 backfills missing rows in the collection-membership join table
from each catalog item's existing collection label. It uses `ON CONFLICT DO
NOTHING`, so it preserves current links and any intentional cross-collection
memberships while repairing older seed gaps; it does not delete or rewrite
catalog, inventory, wallet, or marketplace data.

The new pieces use the existing rarity values, Ballet-level requirements,
prices, and cosmetic metadata; `beauty` is the one new shop category.
Wearable metadata continues to be interpreted by the existing wardrobe
service. The rarity names are centralized in `src/shop/rarity.ts`; they affect
labels and presentation only, not activity stats, rewards, or shop eligibility.
Collection membership is many-to-many, and completion is a read-only count of
distinct owned item IDs.

`CollectionService` aggregates inventory and active marketplace escrow in one
read, so listing a piece does not make collection progress flicker or count it
twice. Completing a collection does not grant an item or currency. Transactional
achievement hooks award the `first-collection` badge on the first completion
and `three-collections` after three completions. These are cosmetic milestones
only; they do not affect gameplay or the economy.

The item options for `/shop item` and `/shop buy` accept the stable IDs shown by
`/shop browse`; the previous six-choice list could not represent an expanded
catalog. `/shop collections` displays per-user progress. Successful browse and
collection responses are public channel messages; expected failures remain
private.
