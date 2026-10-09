import type { StructuredLogger } from './logging/logger.js';

export const SHUTDOWN_TIMEOUT_MS = 20_000;
export type ShutdownReason = 'SIGINT' | 'SIGTERM' | 'discord_recovery' | 'startup_failure';

/** Bounded cleanup also terminates Eris REST retry timers that disconnect cannot cancel. */
export class ShutdownController {
  private requested = false;
  private finished = false;

  constructor(
    private readonly stopRuntime: () => Promise<void>,
    private readonly closeDatabase: () => Promise<void>,
    private readonly logger: StructuredLogger,
    private readonly exit: (code: number) => void,
  ) {}

  get stopping(): boolean {
    return this.requested;
  }

  async request(reason: ShutdownReason): Promise<void> {
    if (this.requested) return;
    this.requested = true;
    let code = reason === 'SIGINT' || reason === 'SIGTERM' ? 0 : 1;
    const finish = (exitCode: number): void => {
      if (this.finished) return;
      this.finished = true;
      this.exit(exitCode);
    };
    this.logger.info('application.shutdown_requested', { reason });
    const timeout = setTimeout(() => {
      this.logger.warn('application.shutdown_timeout');
      finish(1);
    }, SHUTDOWN_TIMEOUT_MS);
    for (const [stage, cleanup] of [
      ['discord', this.stopRuntime],
      ['database', this.closeDatabase],
    ] as const) {
      try {
        await cleanup();
      } catch (error) {
        code = 1;
        this.logger.error(`application.${stage}_shutdown_failed`, error);
      }
    }
    clearTimeout(timeout);
    this.logger.info('application.stopped');
    finish(code);
  }
}
