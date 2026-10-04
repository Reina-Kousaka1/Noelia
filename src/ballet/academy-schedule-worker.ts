import { randomUUID } from 'node:crypto';

import type { AcademyGameplayPort } from './academy-gameplay-service.js';

const DEFAULT_INTERVAL_MS = 30_000;

/** One process-wide scheduler; missed classes are only recorded after continuous healthy observation. */
export class AcademyScheduleWorker {
  private interval: ReturnType<typeof setInterval> | undefined;
  private runtimeInstanceId: string = randomUUID();
  private runningTick: Promise<void> | undefined;

  public constructor(
    private readonly academy: Pick<AcademyGameplayPort, 'reconcileDueClasses'>,
    private readonly onError: (error: unknown) => void,
    private readonly intervalMs = DEFAULT_INTERVAL_MS,
    private readonly createRuntimeInstanceId: () => string = randomUUID,
  ) {
    if (!Number.isInteger(intervalMs) || intervalMs < 1_000) {
      throw new RangeError('Academy schedule worker interval must be at least one second.');
    }
  }

  public start(): void {
    if (this.interval !== undefined) return;
    this.runtimeInstanceId = this.createRuntimeInstanceId();
    void this.tick();
    this.interval = setInterval(() => void this.tick(), this.intervalMs);
  }

  public async stop(): Promise<void> {
    if (this.interval !== undefined) clearInterval(this.interval);
    this.interval = undefined;
    // A later Discord reconnect starts a new observed interval. The database
    // will treat sessions whose check-in window overlapped it as system-cancelled.
    this.runtimeInstanceId = this.createRuntimeInstanceId();
    await this.runningTick;
  }

  private tick(): Promise<void> {
    if (this.runningTick !== undefined) return this.runningTick;
    const runtimeInstanceId = this.runtimeInstanceId;
    const operation = this.academy
      .reconcileDueClasses(runtimeInstanceId)
      .then(() => undefined)
      .catch((error: unknown) => {
        try {
          this.onError(error);
        } catch {
          // Logging failure must not terminate the shared scheduled worker.
        }
      })
      .finally(() => {
        if (this.runningTick === operation) this.runningTick = undefined;
      });
    this.runningTick = operation;
    return operation;
  }
}
