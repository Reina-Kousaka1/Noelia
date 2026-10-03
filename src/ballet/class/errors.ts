import { ExpectedDomainError } from '../../utils/expected-domain-error.js';

export class BalletClassNotFoundError extends ExpectedDomainError {
  public constructor() {
    super(
      'The requested Ballet class is missing or belongs to another user.',
      'That class is no longer available.',
    );
    this.name = 'BalletClassNotFoundError';
  }
}

export class BalletClassStateError extends ExpectedDomainError {
  public constructor(message: string) {
    super(`Ballet class transition rejected: ${message}`, message);
    this.name = 'BalletClassStateError';
  }
}

export class BalletClassRequirementError extends ExpectedDomainError {
  public constructor(message: string) {
    super(`Ballet class requirement not met: ${message}`, message);
    this.name = 'BalletClassRequirementError';
  }
}
