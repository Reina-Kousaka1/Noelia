import { afterEach, describe, expect, it, vi } from 'vitest';

import { AcademyScheduleWorker } from '../../src/ballet/academy-schedule-worker.js';

describe('AcademyScheduleWorker', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps one interval across duplicate ready events and stops cleanly', async () => {
    vi.useFakeTimers();
    const reconcileDueClasses = vi.fn().mockResolvedValue(0);
    const worker = new AcademyScheduleWorker(
      { reconcileDueClasses },
      vi.fn(),
      1_000,
      () => '250aad21-50a6-4d43-a450-b2c8f8825070',
    );

    worker.start();
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(reconcileDueClasses).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(reconcileDueClasses).toHaveBeenCalledTimes(2);
    await worker.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(reconcileDueClasses).toHaveBeenCalledTimes(2);
  });

  it('reports a failed tick and continues future observations', async () => {
    vi.useFakeTimers();
    const failure = new Error('temporary database outage');
    const reconcileDueClasses = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(0);
    const onError = vi.fn();
    const worker = new AcademyScheduleWorker(
      { reconcileDueClasses },
      onError,
      1_000,
      () => '250aad21-50a6-4d43-a450-b2c8f8825070',
    );

    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(failure);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reconcileDueClasses).toHaveBeenCalledTimes(2);
    await worker.stop();
  });

  it('waits for an in-flight database tick before shutdown completes', async () => {
    vi.useFakeTimers();
    let finishTick: (() => void) | undefined;
    const pendingTick = new Promise<void>((resolve) => {
      finishTick = resolve;
    });
    const worker = new AcademyScheduleWorker(
      { reconcileDueClasses: vi.fn(() => pendingTick.then(() => 0)) },
      vi.fn(),
      1_000,
      () => '250aad21-50a6-4d43-a450-b2c8f8825070',
    );

    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finishTick?.();
    await stopping;
    expect(stopped).toBe(true);
  });
});
