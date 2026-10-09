import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShutdownController, SHUTDOWN_TIMEOUT_MS } from '../src/infrastructure/shutdown.js';
import { StructuredLogger } from '../src/infrastructure/logging/logger.js';
function fixture(stop = vi.fn().mockResolvedValue(undefined)) {
  const logger = new StructuredLogger();
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  const close = vi.fn().mockResolvedValue(undefined);
  const exit = vi.fn();
  return { controller: new ShutdownController(stop, close, logger, exit), stop, close, exit };
}
describe('ShutdownController', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it.each(['SIGTERM', 'SIGINT'] as const)('cleans up and exits normally for %s', async (signal) => {
    const f = fixture();
    await f.controller.request(signal);
    expect(f.stop).toHaveBeenCalledOnce();
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.exit).toHaveBeenCalledWith(0);
  });
  it('exits non-zero after ordered cleanup and never starts a second recovery', async () => {
    const order: string[] = [];
    const f = fixture(
      vi.fn(async () => {
        order.push('discord');
      }),
    );
    f.close.mockImplementation(async () => {
      order.push('database');
    });
    await f.controller.request('discord_recovery');
    await f.controller.request('discord_recovery');
    expect(order).toEqual(['discord', 'database']);
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('bounds hanging cleanup and does not exit again after late completion', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const f = fixture(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const pending = f.controller.request('discord_recovery');
    vi.advanceTimersByTime(SHUTDOWN_TIMEOUT_MS);
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
    release();
    await pending;
    expect(f.exit).toHaveBeenCalledOnce();
  });
  it('still closes the database when Discord cleanup fails', async () => {
    const f = fixture(vi.fn().mockRejectedValue(new Error('cleanup failed')));
    await f.controller.request('startup_failure');
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.exit).toHaveBeenCalledWith(1);
  });
});
