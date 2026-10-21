import { describe, expect, it } from 'vitest';

import type { BalletWeeklyStudioCard } from '../../src/ballet/studio-v22/types.js';
import { renderWeeklyStudioCard } from '../../src/commands/ballet/studio-presentation.js';

describe('weekly Studio card presentation', () => {
  it('renders only persisted or domain-derived preparation and teacher state', () => {
    const card: BalletWeeklyStudioCard = {
      training: {} as BalletWeeklyStudioCard['training'],
      preparation: {
        target: 22,
        completed: 8,
        remaining: 14,
        deadlineAt: new Date('2026-10-29T12:00:00.000Z'),
        timeRemainingMs: 90 * 60_000,
      },
      consistencyStamina: 104,
      readiness: { state: 'BALANCED', conditionModifier: -1 },
      mood: 'CONCERNED',
      patience: { current: 1, maximum: 3 },
      correctiveTasks: [
        {
          taskId: 'task-1',
          taskType: 'SECTION_SUCCESS',
          targetSection: 'BARRE',
          reasonCode: 'REPEATED_TRAINING_FAILURE',
          status: 'OPEN',
          createdAt: new Date('2026-10-22T00:00:00.000Z'),
          dueAt: new Date('2026-11-05T00:00:00.000Z'),
        },
      ],
      pendingFollowup: {
        extraWorkload: 2,
        expiresAt: new Date('2026-11-05T00:00:00.000Z'),
      },
      warnings: ['PREPARATION_INCOMPLETE', 'PATIENCE_LOW'],
    };

    const rendered = renderWeeklyStudioCard(card);
    expect(rendered).toContain('Preparation: 8/22 · 14 remaining · 1h 30m left');
    expect(rendered).toContain('Stamina: 104/150 · Readiness: balanced (-1)');
    expect(rendered).toContain('Madame’s mood: concerned · Patience 1/3');
    expect(rendered).toContain('Corrective task: Barre success by');
    expect(rendered).toContain('follow-up: +2 workload');
    expect(rendered).toContain('preparation incomplete · patience low');
    expect(rendered).not.toContain('Focus:');
    expect(rendered).not.toContain('Streak:');
  });
});
