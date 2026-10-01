import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import {
  completeCommand,
  deferCommand,
  respondPrivately,
} from '../../src/interactions/response-policy.js';

describe('interaction response policy', () => {
  it('defers normal commands publicly by default and completes the original response', async () => {
    const interaction = {
      acknowledged: true,
      defer: vi.fn().mockResolvedValue(undefined),
      editOriginalMessage: vi.fn().mockResolvedValue(undefined),
      createMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as Eris.CommandInteraction;

    await deferCommand(interaction);
    await completeCommand(interaction, { content: 'Ballet progress' });

    expect(interaction.defer).toHaveBeenCalledWith();
    expect(interaction.editOriginalMessage).toHaveBeenCalledWith({ content: 'Ballet progress' });
    expect(interaction.createMessage).not.toHaveBeenCalled();
  });

  it('allows an explicitly private defer', async () => {
    const defer = vi.fn().mockResolvedValue(undefined);
    const interaction = { defer } as unknown as Eris.CommandInteraction;

    await deferCommand(interaction, 'ephemeral');

    expect(defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
  });

  it('keeps an expected error private after a public defer', async () => {
    const order: string[] = [];
    const interaction = {
      acknowledged: true,
      deleteOriginalMessage: vi.fn().mockImplementation(async () => order.push('delete')),
      createFollowup: vi.fn().mockImplementation(async (response: { flags?: number }) => {
        order.push('followup');
        expect(response.flags).toBe(Eris.Constants.MessageFlags.EPHEMERAL);
      }),
      createMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as Eris.CommandInteraction;

    await respondPrivately(interaction, 'That item is unavailable.');

    expect(order).toEqual(['delete', 'followup']);
    expect(interaction.createFollowup).toHaveBeenCalledWith({
      content: 'That item is unavailable.',
      flags: Eris.Constants.MessageFlags.EPHEMERAL,
    });
    expect(interaction.createMessage).not.toHaveBeenCalled();
  });
});
