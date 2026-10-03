import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { learnCommand } from '../../src/commands/learn/learn.command.js';
import { getKnowledgeLesson } from '../../src/knowledge/catalog.js';

const userId = '222222222222222222';

function createInteraction(subcommandName: string, options: object[] = []) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: '111111111111111111',
    member: { id: userId },
    data: {
      options: [
        {
          name: subcommandName,
          type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
          options,
        },
      ],
    },
    acknowledged: true,
    defer,
    editOriginalMessage,
  } as unknown as Eris.CommandInteraction;
  return { interaction, defer, editOriginalMessage };
}

describe('learn command', () => {
  it('registers browse, progress, read, and answer workflows', () => {
    expect(learnCommand.definition.options?.map((option) => option.name)).toEqual([
      'browse',
      'progress',
      'read',
      'answer',
    ]);
  });

  it('renders lesson content and available answers without changing progress', async () => {
    const lesson = getKnowledgeLesson('ballet-french-plie-01');
    if (lesson === undefined) throw new Error('The test lesson is missing.');
    const { interaction, defer, editOriginalMessage } = createInteraction('read', [
      {
        name: 'lesson',
        type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
        value: lesson.id,
      },
    ]);
    const knowledge = {
      getProgress: vi.fn(),
      listLessons: vi.fn(),
      answer: vi.fn(),
    };

    await learnCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { knowledge } as never,
    });

    expect(defer).toHaveBeenCalledOnce();
    expect(knowledge.answer).not.toHaveBeenCalled();
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: 'Ballet French · A plié',
          description: expect.stringContaining('What does plié describe?'),
        }),
      ],
    });
  });

  it('passes the Discord interaction ID to the idempotent answer operation', async () => {
    const lessonId = 'ballet-french-plie-01';
    const { interaction, editOriginalMessage } = createInteraction('answer', [
      {
        name: 'lesson',
        type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
        value: lessonId,
      },
      { name: 'answer', type: Eris.Constants.ApplicationCommandOptionTypes.STRING, value: 'b' },
    ]);
    const answer = vi.fn().mockResolvedValue({
      lessonId,
      title: 'A plié',
      domain: 'ballet_french',
      outcome: 'CORRECT',
      pointsAwarded: 5,
      pointsAfter: 5,
      replayed: false,
    });

    await learnCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { knowledge: { getProgress: vi.fn(), listLessons: vi.fn(), answer } } as never,
    });

    expect(answer).toHaveBeenCalledWith(interaction.id, userId, lessonId, 'b');
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: 'Très bien — lesson complete',
          description: expect.stringContaining('+5 Knowledge points'),
        }),
      ],
    });
  });
});
