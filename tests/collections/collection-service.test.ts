import type { Pool, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { CollectionService } from '../../src/collections/collection-service.js';

interface CollectionFixture extends QueryResultRow {
  readonly collection_id: string;
  readonly display_name: string;
  readonly description: string;
  readonly owned_items: number;
  readonly total_items: number;
}

describe('CollectionService', () => {
  it('aggregates owned collection pieces and recognizes completion', async () => {
    const rows: CollectionFixture[] = [
      {
        collection_id: 'first-position',
        display_name: 'First Position',
        description: 'A first collection.',
        owned_items: 3,
        total_items: 3,
      },
      {
        collection_id: 'sunday-studio',
        display_name: 'Sunday Studio',
        description: 'A studio collection.',
        owned_items: 1,
        total_items: 7,
      },
    ];
    const query = vi.fn().mockResolvedValue({ rows });
    const service = new CollectionService({ query } as unknown as Pool);

    await expect(service.listProgress('222222222222222222')).resolves.toEqual([
      {
        collectionId: 'first-position',
        displayName: 'First Position',
        description: 'A first collection.',
        ownedItems: 3,
        totalItems: 3,
        complete: true,
      },
      {
        collectionId: 'sunday-studio',
        displayName: 'Sunday Studio',
        description: 'A studio collection.',
        ownedItems: 1,
        totalItems: 7,
        complete: false,
      },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('marketplace_escrow'), [
      '222222222222222222',
    ]);
  });

  it('validates user identity before querying persistence', async () => {
    const query = vi.fn();
    const service = new CollectionService({ query } as unknown as Pool);

    await expect(service.listProgress('not-a-discord-id')).rejects.toThrow(
      'Discord user ID must be a 17- to 20-digit numeric ID.',
    );
    expect(query).not.toHaveBeenCalled();
  });
});
