import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import {
  divorceCommand,
  marryCommand,
  marriageCommand,
} from '../../src/commands/marriage/marriage.command.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';

function makeInteraction(options: Eris.InteractionDataOptions[] = []) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const createFollowup = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: '111111111111111111',
    guildID: '333333333333333333',
    member: { id: '222222222222222222' },
    data: { options },
    defer,
    createFollowup,
  } as unknown as Eris.CommandInteraction;
  return { interaction, defer, createFollowup };
}

describe('relationship commands', () => {
  it('posts a public proposal with target-only accept and decline controls', async () => {
    const { interaction, defer, createFollowup } = makeInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.USER,
        name: 'user',
        value: '444444444444444444',
      },
    ]);
    const relationships = {
      propose: vi.fn().mockResolvedValue({
        proposal: { proposalId: '57' },
        replayed: false,
      }),
    };

    await marryCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { relationships } as never,
    });

    expect(defer).toHaveBeenCalledWith();
    expect(relationships.propose).toHaveBeenCalledWith(
      '111111111111111111',
      '333333333333333333',
      '222222222222222222',
      '444444444444444444',
    );
    expect(createFollowup).toHaveBeenCalledWith(
      expect.objectContaining({
        content: NOELIA_COPY.marriageProposal('222222222222222222', '444444444444444444'),
        components: [
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({ custom_id: 'noelia:marriage:accept:57' }),
              expect.objectContaining({ custom_id: 'noelia:marriage:decline:57' }),
              expect.objectContaining({ custom_id: 'noelia:marriage:cancel:57' }),
            ]),
          }),
        ],
      }),
    );
  });

  it('keeps marriage status private', async () => {
    const { interaction, defer, createFollowup } = makeInteraction();
    const relationships = {
      getMarriage: vi.fn().mockResolvedValue({
        relationshipId: '57',
        guildId: '333333333333333333',
        partnerUserId: '444444444444444444',
        marriedAt: new Date('2026-10-01T12:00:00.000Z'),
      }),
    };

    await marriageCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { relationships } as never,
    });

    expect(defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.marriageTitle,
          description: NOELIA_COPY.marriageStatus('444444444444444444', 'Oct 1, 2026'),
        }),
      ],
    });
  });

  it('uses the interaction ID for an idempotent divorce', async () => {
    const { interaction, defer, createFollowup } = makeInteraction();
    const relationships = {
      divorce: vi.fn().mockResolvedValue({ relationshipId: '57', replayed: false }),
    };

    await divorceCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services: { relationships } as never,
    });

    expect(defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(relationships.divorce).toHaveBeenCalledWith('111111111111111111', '222222222222222222');
    expect(createFollowup).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: NOELIA_COPY.marriageTitle,
          description: NOELIA_COPY.marriageDivorced,
        }),
      ],
    });
  });
});
