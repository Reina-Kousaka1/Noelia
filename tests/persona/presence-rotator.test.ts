import * as Eris from 'eris';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NOELIA_PRESENCE } from '../../src/persona/copy.js';
import { PersonaPresenceRotator } from '../../src/persona/presence-rotator.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('PersonaPresenceRotator', () => {
  it('rotates through central Balletcore presence text and stops cleanly', () => {
    vi.useFakeTimers();
    const client = { editStatus: vi.fn() };
    const onError = vi.fn();
    const rotator = new PersonaPresenceRotator(client, onError, 1_000);

    rotator.start();
    rotator.start();
    expect(client.editStatus).toHaveBeenCalledTimes(1);
    expect(client.editStatus).toHaveBeenLastCalledWith('online', {
      name: NOELIA_PRESENCE[0],
      type: Eris.Constants.ActivityTypes.GAME,
    });

    vi.advanceTimersByTime(2_000);
    expect(client.editStatus).toHaveBeenCalledTimes(3);
    expect(client.editStatus).toHaveBeenLastCalledWith('online', {
      name: NOELIA_PRESENCE[2],
      type: Eris.Constants.ActivityTypes.GAME,
    });

    rotator.stop();
    vi.advanceTimersByTime(10_000);
    expect(client.editStatus).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports presence API errors instead of throwing from the timer', () => {
    const failure = new Error('gateway unavailable');
    const client = {
      editStatus: vi.fn().mockImplementation(() => {
        throw failure;
      }),
    };
    const onError = vi.fn();
    const rotator = new PersonaPresenceRotator(client, onError, 60_000);

    rotator.start();
    expect(onError).toHaveBeenCalledWith(failure);
    rotator.stop();
  });
});
