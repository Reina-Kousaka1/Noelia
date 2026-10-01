import type { Pool, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { BalletAcademyService } from '../../src/ballet/academy-service.js';

interface EvidenceRow extends QueryResultRow {
  readonly level: number;
  readonly completed_activity_codes: string[];
  readonly best_performance_tiers: string[];
  readonly technique: number;
  readonly musicality: number;
  readonly performance: number;
}

describe('BalletAcademyService', () => {
  it('derives the rank from existing PostgreSQL progress records', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          level: 20,
          completed_activity_codes: [
            'audition',
            'barre',
            'choreography',
            'class',
            'recital',
            'rehearsal',
          ],
          best_performance_tiers: ['spring-recital:SILVER'],
          technique: 22,
          musicality: 18,
          performance: 14,
        } satisfies EvidenceRow,
      ],
    });
    const service = new BalletAcademyService({ query } as unknown as Pool);

    await expect(service.getProgress('222222222222222222')).resolves.toMatchObject({
      currentRank: { id: 'soloist', title: 'Soloist' },
      nextRank: { id: 'principal-artist' },
      completedRankCount: 3,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ballet_performance_completions'), [
      '222222222222222222',
    ]);
  });

  it('rejects invalid Discord IDs before querying PostgreSQL', async () => {
    const query = vi.fn();
    const service = new BalletAcademyService({ query } as unknown as Pool);

    await expect(service.getProgress('invalid')).rejects.toThrow('Discord user ID');
    expect(query).not.toHaveBeenCalled();
  });
});
