import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class InsufficientBalletSlippersError extends ExpectedDomainError {
  public constructor(
    public readonly balance: bigint,
    public readonly requiredAmount: bigint,
  ) {
    super(
      'Not enough Ballet Slippers for this action.',
      `You need ${requiredAmount.toLocaleString('en-US')} 🩰, but have ${balance.toLocaleString('en-US')} 🩰.`,
    );
    this.name = 'InsufficientBalletSlippersError';
  }
}

export class IdempotencyConflictError extends ExpectedDomainError {
  public constructor() {
    super(
      'This Discord interaction has already been used for a different wallet change.',
      'This action could not be safely repeated. Please start it again.',
    );
    this.name = 'IdempotencyConflictError';
  }
}

export class WalletBalanceLimitError extends ExpectedDomainError {
  public constructor() {
    super(
      'The Ballet Slippers balance would exceed the supported integer range.',
      'This wallet has reached its supported balance limit.',
    );
    this.name = 'WalletBalanceLimitError';
  }
}
