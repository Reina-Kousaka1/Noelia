import type { Pool, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { BalletAcademyService } from '../../src/ballet/academy-service.js';

interface EvidenceRow extends QueryResultRow {
  readonly level: number;
  readonly completed_activity_codes: string[];
  readonly best_performance_tiers: string[];
  readonly knowledge_lesson_counts: Record<string, number>;
  readonly technique: number;
  readonly flexibility: number;
  readonly musicality: number;
  readonly performance: number;
  readonly pointe: number;
  readonly stamina: number;
}

describe('BalletAcademyService', () => {
  it('derives the canonical stage from existing PostgreSQL progress records', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          level: 40,
          completed_activity_codes: [
            'audition',
            'barre',
            'choreography',
            'class',
            'center-practice',
            'stretching',
            'technique',
            'pointe-practice',
            'performance',
            'recital',
            'rehearsal',
            'showcase',
          ],
          best_performance_tiers: [
            'spring-recital:PRIMA',
            'moonlit-showcase:PRIMA',
            'prima-audition:GOLD',
          ],
          knowledge_lesson_counts: {
            musicality: 3,
            ballet_french: 3,
            ballet_theory: 3,
            ballet_history: 3,
            french_history_culture: 3,
            academy_history: 3,
            repertoire_studies: 3,
            academy_etiquette: 3,
          },
          technique: 80,
          flexibility: 80,
          musicality: 80,
          performance: 80,
          pointe: 80,
          stamina: 80,
        } satisfies EvidenceRow,
      ],
    });
    const service = new BalletAcademyService({ query } as unknown as Pool);

    await expect(service.getProgress('222222222222222222')).resolves.toMatchObject({
      currentRank: { id: 'advanced-2', title: 'Advanced 2' },
      nextRank: { id: 'solo-seal' },
      completedRankCount: 17,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('academy_lesson_completions'), [
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
