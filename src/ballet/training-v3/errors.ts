import { ExpectedDomainError } from '../../utils/expected-domain-error.js';
import type { BalletRecoveryAction } from './types.js';

export class BalletTrainingCooldownError extends ExpectedDomainError {
  public constructor(
    public readonly action: BalletRecoveryAction,
    public readonly nextAllowedAt: Date,
    now: Date,
  ) {
    const actionName = RECOVERY_ACTION_NAMES[action];
    super(
      `The ${actionName} recovery action was requested during its configured cooldown.`,
      `${actionName} is available again in ${formatRemainingTime(nextAllowedAt, now)}.`,
    );
    this.name = 'BalletTrainingCooldownError';
  }
}

const RECOVERY_ACTION_NAMES: Readonly<Record<BalletRecoveryAction, string>> = {
  REST: 'Rest',
  SLEEP: 'Sleep',
  NOURISH: 'Nourish',
  REHABILITATE: 'Rehabilitate',
};

function formatRemainingTime(nextAllowedAt: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((nextAllowedAt.getTime() - now.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
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
