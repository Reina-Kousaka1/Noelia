import type * as Eris from 'eris';
import type { StructuredLogger } from '../infrastructure/logging/logger.js';

export const CONNECTION_GRACE_MS = 15 * 60_000;
export const CONNECTION_CHECK_MS = 30_000;
export const HEARTBEAT_STALE_MS = 2 * 60_000;

export function gatewayIsHealthy(client: Eris.Client, now = Date.now()): boolean {
  return (
    client.ready &&
    client.shards.size > 0 &&
    [...client.shards.values()].every((shard) => {
      const heartbeat = shard.lastHeartbeatReceived ?? shard.lastHeartbeatSent ?? client.startTime;
      return (
        shard.ready &&
        shard.status === 'ready' &&
        shard.ws?.readyState === 1 &&
        heartbeat > 0 &&
        now - heartbeat <= HEARTBEAT_STALE_MS
      );
    })
  );
}

/** Eris owns reconnect/resume. This only bounds a continuously unhealthy process. */
export class ConnectionWatchdog {
  private timer: ReturnType<typeof setInterval> | undefined;
  private unhealthySince: number | undefined;
  private recovered = false;

  constructor(
    private readonly healthy: () => boolean,
    private readonly recover: () => void,
    private readonly logger: StructuredLogger,
  ) {}

  start(): void {
    if (this.timer !== undefined || this.recovered) return;
    this.timer = setInterval(() => this.observe(), CONNECTION_CHECK_MS);
    this.timer.unref();
    this.observe();
  }

  observe(): void {
    if (this.timer === undefined || this.recovered) return;
    if (this.healthy()) {
      if (this.unhealthySince !== undefined) this.logger.info('discord.connection_recovered');
      this.unhealthySince = undefined;
      return;
    }
    const now = Date.now();
    if (this.unhealthySince === undefined) {
      this.unhealthySince = now;
      this.logger.warn('discord.connection_unhealthy', { graceMs: CONNECTION_GRACE_MS });
    }
    if (now - this.unhealthySince >= CONNECTION_GRACE_MS) {
      this.recovered = true;
      this.stop();
      this.logger.warn('discord.connection_recovery_requested');
      this.recover();
    }
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.unhealthySince = undefined;
  }
}
