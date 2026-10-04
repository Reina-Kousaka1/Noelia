import { ExpectedDomainError } from '../../utils/expected-domain-error.js';

export class BalletTrainingCooldownError extends ExpectedDomainError {
  public constructor(public readonly nextAllowedAt: Date) {
    super(
      'A Ballet recovery action was requested during its configured cooldown.',
      `Your next recovery action is available <t:${Math.floor(nextAllowedAt.getTime() / 1_000)}:R>.`,
    );
    this.name = 'BalletTrainingCooldownError';
  }
}

export class BalletRehabilitationUnavailableError extends ExpectedDomainError {
  public constructor() {
    super(
      'A fictional rehabilitation session was requested without an active training setback.',
      'There is no active training setback to resolve. This is a fictional gameplay status, not a medical assessment.',
    );
    this.name = 'BalletRehabilitationUnavailableError';
  }
}

export class BalletTrainingActionReplayConflictError extends ExpectedDomainError {
  public constructor() {
    super(
      'A Ballet Training V3 interaction ID was reused for another action.',
      'That interaction could not be replayed for this action. Please run the command again.',
    );
    this.name = 'BalletTrainingActionReplayConflictError';
  }
}
