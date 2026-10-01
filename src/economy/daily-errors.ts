import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class DailyCooldownError extends ExpectedDomainError {
  public constructor(public readonly nextClaimAt: Date) {
    const timestamp = Math.floor(nextClaimAt.getTime() / 1_000);
    super(
      'The daily reward cooldown is still active.',
      `Your next Ballet Slippers daily is available <t:${timestamp}:R>.`,
    );
    this.name = 'DailyCooldownError';
  }
}
