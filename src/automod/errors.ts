import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class AutomodConfigurationError extends ExpectedDomainError {
  public constructor(message: string, userMessage: string) {
    super(message, userMessage);
    this.name = 'AutomodConfigurationError';
  }
}

export class AutomodIdempotencyConflictError extends ExpectedDomainError {
  public constructor() {
    super(
      'AutoMod interaction ID was reused with a different configuration request.',
      'That configuration interaction was already used. Please submit the change again.',
    );
    this.name = 'AutomodIdempotencyConflictError';
  }
}
