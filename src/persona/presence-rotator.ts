import * as Eris from 'eris';

import { NOELIA_PRESENCE } from './copy.js';

export const PERSONA_PRESENCE_ROTATION_INTERVAL_MS = 2 * 60 * 1_000;

export class PersonaPresenceRotator {
  private interval: ReturnType<typeof setInterval> | undefined;
  private index = 0;

  public constructor(
    private readonly client: Pick<Eris.Client, 'editStatus'>,
    private readonly onError: (error: unknown) => void,
    private readonly intervalMs = PERSONA_PRESENCE_ROTATION_INTERVAL_MS,
  ) {}

  public start(): void {
    if (this.interval !== undefined) {
      return;
    }

    this.publish();
    this.interval = setInterval(() => {
      this.index = (this.index + 1) % NOELIA_PRESENCE.length;
      this.publish();
    }, this.intervalMs);
    this.interval.unref();
  }

  public stop(): void {
    if (this.interval === undefined) {
      return;
    }

    clearInterval(this.interval);
    this.interval = undefined;
  }

  private publish(): void {
    const activity = NOELIA_PRESENCE[this.index];

    if (activity === undefined) {
      return;
    }

    try {
      this.client.editStatus('online', {
        name: activity,
        type: Eris.Constants.ActivityTypes.GAME,
      });
    } catch (error) {
      this.onError(error);
    }
  }
}
