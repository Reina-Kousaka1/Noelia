# Shop catalog, rarity, and collections V2

Migration V10 adds normalized `shop_collections` and `shop_item_collections`
tables, then links the original Phase-1 shop items to stable collection IDs.
The seeded catalog grows to 62 distinct Balletcore pieces across eleven
collections. Existing catalog, inventory, purchase history, and wallet rows are
preserved; the migration is additive.

The new pieces use the existing item categories, Ballet-level requirements,
rarity values, prices, and cosmetic metadata. Wearable metadata continues to
be interpreted by the existing wardrobe service. The rarity names are
centralized in `src/shop/rarity.ts`; they affect labels and presentation only,
not activity stats, rewards, or shop eligibility. Collection membership is
many-to-many, and completion is a read-only count of distinct owned item IDs.

`CollectionService` aggregates inventory and active marketplace escrow in one
read, so listing a piece does not make collection progress flicker or count it
twice. A completed collection currently grants no automatic title, item, or
currency. Achievement V1 can consume collection-completion state later without
making the collection query a second inventory or reward system.

The item options for `/shop item` and `/shop buy` accept the stable IDs shown by
`/shop browse`; the previous six-choice list could not represent an expanded
catalog. `/shop collections` displays per-user progress. Browse and progress
remain private responses.
