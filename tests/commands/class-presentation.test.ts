import { describe, expect, it } from 'vitest';

import type { BalletClassView } from '../../src/ballet/class/types.js';
import type { BalletStudioAttemptResult } from '../../src/ballet/studio-v22/types.js';
import { renderBalletClassMessage } from '../../src/commands/ballet/class-presentation.js';

describe('Madame Studio reaction presentation', () => {
  it('explains corrective escalation and an early-ended session in the class response', async () => {
    const view = {
      classId: 'class-1',
      discordUserId: '123456789012345678',
      classType: 'REGULAR',
      classTypeName: 'Regular Ballet Class',
      academyStageId: 'solo-seal',
      academyStageName: 'Solo Seal',
      status: 'ABANDONED',
      currentSection: 'BARRE',
      startedAt: new Date('2026-10-22T00:00:00.000Z'),
      completedAt: null,
      abandonedAt: new Date('2026-10-22T01:00:00.000Z'),
      currentExerciseIndex: 4,
      curriculum: { exercises: Array.from({ length: 8 }), sections: [] },
      preparation: [],
      attempts: [],
      review: null,
      replayed: false,
    } as unknown as BalletClassView;
    const reaction: BalletStudioAttemptResult = {
      reactions: [
        'REPEATED_FAILURE',
        'CORRECTIVE_ASSIGNED',
        'PATIENCE_LOW',
        'SESSION_ENDED',
        'FOLLOWUP_ASSIGNED',
      ],
      mood: 'FRUSTRATED',
      patience: 0,
      maximumPatience: 3,
      sessionEndedEarly: true,
      followup: { extraWorkload: 2, expiresAt: new Date('2026-11-05T00:00:00.000Z') },
      correctiveTask: {
        taskId: 'task-1',
        targetSection: 'BARRE',
        dueAt: new Date('2026-11-05T00:00:00.000Z'),
      },
    };

    const message = await renderBalletClassMessage(
      view,
      undefined,
      view.discordUserId,
      undefined,
      reaction,
    );
    const description = message.embeds?.[0]?.description ?? '';
    expect(description).toContain('Madame ended this session after repeated difficulties');
    expect(description).toContain(
      'Madame assigned a corrective task: complete a successful Barre exercise',
    );
    expect(description).toContain('Madame’s patience is low');
    expect(description).toContain('Madame assigned +2 follow-up workload');
    expect(description).toContain('Madame has ended this session');
    expect(description).toContain('Madame’s current studio mood: frustrated');
    expect(description).toContain('Patience: 0 / 3');
  });
});
