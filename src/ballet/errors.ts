import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class UnknownBalletActivityError extends ExpectedDomainError {
  public constructor() {
    super(
      'The requested ballet activity is missing or inactive.',
      'That activity is not available. Use /ballet activities to see the current list.',
    );
    this.name = 'UnknownBalletActivityError';
  }
}

export class BalletActivityLockedError extends ExpectedDomainError {
  public constructor(public readonly requiredLevel: number) {
    super(
      `The activity requires Ballet level ${requiredLevel}.`,
      `That activity unlocks at Ballet level ${requiredLevel}.`,
    );
    this.name = 'BalletActivityLockedError';
  }
}

export class BalletCooldownError extends ExpectedDomainError {
  public constructor(public readonly nextAvailableAt: Date) {
    const timestamp = Math.floor(nextAvailableAt.getTime() / 1_000);
    super(
      'The ballet activity cooldown is still active.',
      `You can practice that activity again <t:${timestamp}:R>.`,
    );
    this.name = 'BalletCooldownError';
  }
}

export class BalletXpLimitError extends ExpectedDomainError {
  public constructor() {
    super(
      'The Ballet XP total would exceed the supported integer range.',
      'Your Ballet XP has reached its supported limit.',
    );
    this.name = 'BalletXpLimitError';
  }
}
