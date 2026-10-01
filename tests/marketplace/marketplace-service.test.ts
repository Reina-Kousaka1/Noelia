import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  MarketplaceListingNotFoundError,
  MarketplacePageError,
  MarketplacePriceError,
  MarketplaceQuantityError,
} from '../../src/marketplace/errors.js';
import { MarketplaceService } from '../../src/marketplace/marketplace-service.js';

describe('MarketplaceService input validation', () => {
  const query = vi.fn();
  const pool = { query, connect: vi.fn() } as unknown as Pool;
  const service = new MarketplaceService(pool, { transferWithinTransaction: vi.fn() });

  it('rejects invalid listing pages before touching PostgreSQL', async () => {
    await expect(service.browse(0)).rejects.toBeInstanceOf(MarketplacePageError);
    await expect(service.browse(100_001)).rejects.toBeInstanceOf(MarketplacePageError);
    await expect(service.listMine('222222222222222222', Number.NaN)).rejects.toBeInstanceOf(
      MarketplacePageError,
    );
    expect(pool.connect).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects invalid quantities and prices before opening a transaction', async () => {
    await expect(
      service.createListing('111111111111111111', '222222222222222222', 'satin-ribbon-bow', 0, 10n),
    ).rejects.toBeInstanceOf(MarketplaceQuantityError);
    await expect(
      service.createListing('111111111111111111', '222222222222222222', 'satin-ribbon-bow', 1, 0n),
    ).rejects.toBeInstanceOf(MarketplacePriceError);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects malformed listing IDs without issuing SQL', async () => {
    await expect(
      service.buy('111111111111111111', '222222222222222222', '0'),
    ).rejects.toBeInstanceOf(MarketplaceListingNotFoundError);
    await expect(
      service.cancel('111111111111111111', '222222222222222222', '1; DROP TABLE shop_catalog'),
    ).rejects.toBeInstanceOf(MarketplaceListingNotFoundError);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
