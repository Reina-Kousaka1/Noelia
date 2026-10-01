import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class UnknownPerformanceError extends ExpectedDomainError {
  public constructor() {
    super(
      'The requested Ballet performance is missing or inactive.',
      'That performance is not available. Use /performance browse to see the current list.',
    );
    this.name = 'UnknownPerformanceError';
  }
}

export class PerformanceLockedError extends ExpectedDomainError {
  public constructor(public readonly reason: 'LEVEL' | 'STATS' | 'EQUIPMENT' | 'ACTIVITY') {
    const messages = {
      LEVEL: 'Reach the required Ballet level before attempting this performance.',
      STATS: 'Build the required Ballet stats before attempting this performance.',
      EQUIPMENT: 'Equip the required ballet item before attempting this performance.',
      ACTIVITY: 'Complete the required Ballet activity before attempting this performance.',
    };
    super(`Ballet performance requirement is not met: ${reason}.`, messages[reason]);
    this.name = 'PerformanceLockedError';
  }
}

export class PerformanceCooldownError extends ExpectedDomainError {
  public constructor(public readonly nextAvailableAt: Date) {
    super(
      'The Ballet performance cooldown is still active.',
      `You can attempt that performance again <t:${Math.floor(nextAvailableAt.getTime() / 1_000)}:R>.`,
    );
    this.name = 'PerformanceCooldownError';
  }
}

export class PerformancePageError extends ExpectedDomainError {
  public constructor() {
    super('Performance page is outside the supported range.', 'That page number is not available.');
    this.name = 'PerformancePageError';
  }
}
