import * as Eris from 'eris';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NOELIA_PRESENCE } from '../../src/persona/copy.js';
import {
  PersonaPresenceRotator,
  PERSONA_PRESENCE_ROTATION_INTERVAL_MS,
} from '../../src/persona/presence-rotator.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('PersonaPresenceRotator', () => {
  it('uses the rebalance status pool and keeps every status concise and valid', () => {
    expect(NOELIA_PRESENCE).toHaveLength(24);
    expect(NOELIA_PRESENCE.slice(0, 4)).toEqual([
      'Oh.',
      'I noticed.',
      'Not competing. Just keeping score.',
      'I do not like attention. I do not need to ask for it.',
    ]);
    expect(NOELIA_PRESENCE).toContain('Again.');
    expect(NOELIA_PRESENCE).toContain('Posture.');
    expect(NOELIA_PRESENCE).toContain('Très bien.');
    expect(NOELIA_PRESENCE.every((status) => status.trim().length > 0)).toBe(true);
    expect(NOELIA_PRESENCE.every((status) => Array.from(status).length <= 128)).toBe(true);
  });

  it('rotates every two minutes with one active timer and stops cleanly', () => {
    vi.useFakeTimers();
    const client = { editStatus: vi.fn() };
    const onError = vi.fn();
    const rotator = new PersonaPresenceRotator(client, onError);

    expect(PERSONA_PRESENCE_ROTATION_INTERVAL_MS).toBe(120_000);
    rotator.start();
    expect(vi.getTimerCount()).toBe(1);
    rotator.start();
    expect(vi.getTimerCount()).toBe(1);
    expect(client.editStatus).toHaveBeenCalledTimes(1);
    expect(client.editStatus).toHaveBeenLastCalledWith('online', {
      name: NOELIA_PRESENCE[0],
      type: Eris.Constants.ActivityTypes.GAME,
    });

    vi.advanceTimersByTime(119_999);
    expect(client.editStatus).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(client.editStatus).toHaveBeenCalledTimes(2);
    expect(client.editStatus).toHaveBeenLastCalledWith('online', {
      name: NOELIA_PRESENCE[1],
      type: Eris.Constants.ActivityTypes.GAME,
    });

    for (let index = 2; index < NOELIA_PRESENCE.length; index += 1) {
      vi.advanceTimersByTime(120_000);
      expect(client.editStatus).toHaveBeenCalledTimes(index + 1);
      expect(client.editStatus).toHaveBeenLastCalledWith('online', {
        name: NOELIA_PRESENCE[index],
        type: Eris.Constants.ActivityTypes.GAME,
      });
    }

    vi.advanceTimersByTime(120_000);
    expect(client.editStatus).toHaveBeenCalledTimes(NOELIA_PRESENCE.length + 1);
    expect(client.editStatus).toHaveBeenLastCalledWith('online', {
      name: NOELIA_PRESENCE[0],
      type: Eris.Constants.ActivityTypes.GAME,
    });

    rotator.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(client.editStatus).toHaveBeenCalledTimes(NOELIA_PRESENCE.length + 1);
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
