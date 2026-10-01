import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class ModerationIdempotencyConflictError extends ExpectedDomainError {
  public constructor() {
    super(
      'Moderation idempotency key was reused with a different request or outcome.',
      'That moderation request was already processed. Review the case record before retrying.',
    );
    this.name = 'ModerationIdempotencyConflictError';
  }
}

export class ModerationCaseIdError extends ExpectedDomainError {
  public constructor() {
    super(
      'Moderation case ID is invalid or does not exist.',
      'That moderation case was not found.',
    );
    this.name = 'ModerationCaseIdError';
  }
}
