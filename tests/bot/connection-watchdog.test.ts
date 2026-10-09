import type * as Eris from 'eris';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectionWatchdog,
  CONNECTION_GRACE_MS,
  gatewayIsHealthy,
} from '../../src/bot/connection-watchdog.js';
import { StructuredLogger } from '../../src/infrastructure/logging/logger.js';

function fixture() {
  vi.useFakeTimers();
  let healthy = true;
  const recover = vi.fn();
  const logger = new StructuredLogger();
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  const watchdog = new ConnectionWatchdog(() => healthy, recover, logger);
  watchdog.start();
  return {
    watchdog,
    recover,
    health: (value: boolean) => {
      healthy = value;
      watchdog.observe();
    },
  };
}

describe('ConnectionWatchdog', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('leaves short disconnects to Eris and resets the grace period on recovery', () => {
    const f = fixture();
    f.health(false);
    vi.advanceTimersByTime(60_000);
    expect(f.recover).not.toHaveBeenCalled();
    f.health(true);
    vi.advanceTimersByTime(CONNECTION_GRACE_MS * 2);
    expect(f.recover).not.toHaveBeenCalled();
    f.health(false);
    vi.advanceTimersByTime(CONNECTION_GRACE_MS - 30_000);
    expect(f.recover).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(f.recover).toHaveBeenCalledOnce();
  });
  it('requests recovery once despite repeated disconnects, starts and observations', () => {
    const f = fixture();
    f.health(false);
    for (let i = 0; i < 10; i++) {
      f.watchdog.start();
      f.health(false);
    }
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(CONNECTION_GRACE_MS);
    f.watchdog.start();
    f.health(true);
    f.health(false);
    vi.advanceTimersByTime(CONNECTION_GRACE_MS * 3);
    expect(f.recover).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds startup without any successful connection', () => {
    const f = fixture();
    f.health(false);
    vi.advanceTimersByTime(CONNECTION_GRACE_MS);
    expect(f.recover).toHaveBeenCalledOnce();
  });
  it.each(['SIGINT', 'SIGTERM'])('shutdown via %s cancels recovery and stale events', () => {
    const f = fixture();
    f.health(false);
    f.watchdog.stop();
    f.watchdog.observe();
    vi.advanceTimersByTime(CONNECTION_GRACE_MS * 2);
    expect(f.recover).not.toHaveBeenCalled();
  });
  it('checks every shard, socket and heartbeat rather than just client.ready', () => {
    const now = Date.now();
    const shard = {
      ready: true,
      status: 'ready',
      ws: { readyState: 1 },
      lastHeartbeatReceived: now,
      lastHeartbeatSent: now,
    };
    const client = {
      ready: true,
      startTime: now,
      shards: new Map([[0, shard]]),
    } as unknown as Eris.Client;
    expect(gatewayIsHealthy(client, now)).toBe(true);
    shard.ready = false;
    expect(gatewayIsHealthy(client, now)).toBe(false);
    shard.ready = true;
    shard.ws.readyState = 3;
    expect(gatewayIsHealthy(client, now)).toBe(false);
    shard.ws.readyState = 1;
    expect(gatewayIsHealthy(client, now + 120_001)).toBe(false);
  });
});
