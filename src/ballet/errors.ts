import { ExpectedDomainError } from '../utils/expected-domain-error.js';
import { formatUniformRequirement } from './uniform.js';
import type { AcademyUniformStatus } from './uniform.js';

export class AcademyEnrollmentRequiredError extends ExpectedDomainError {
  public constructor() {
    super(
      'Academy enrollment is required before claiming starter wear.',
      'Begin your Academy journey with `/academy enroll` first.',
    );
    this.name = 'AcademyEnrollmentRequiredError';
  }
}

export class AcademyUniformRequirementError extends ExpectedDomainError {
  public constructor(public readonly status: AcademyUniformStatus) {
    const userMessage = formatUniformRequirement(status);
    super(`Academy uniform requirement is not met for ${status.rank.id}.`, userMessage);
    this.name = 'AcademyUniformRequirementError';
  }
}

export class AcademyUniformAlreadyClaimedError extends ExpectedDomainError {
  public constructor() {
    super(
      'The one-time Academy starter uniform was already claimed by this user.',
      'Your Academy starter uniform has already been claimed. You can still buy and equip other eligible pieces.',
    );
    this.name = 'AcademyUniformAlreadyClaimedError';
  }
}

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

export class BalletActivityRequirementError extends ExpectedDomainError {
  public constructor(public readonly requirement: 'EQUIPMENT' | 'PREVIOUS_ACTIVITY' | 'STATS') {
    super(
      `The ballet activity requirement is not met: ${requirement}.`,
      requirement === 'EQUIPMENT'
        ? 'Equip the required ballet item before practicing this activity.'
        : requirement === 'PREVIOUS_ACTIVITY'
          ? 'Complete the required ballet activity first.'
          : 'Build the required Ballet stats before attempting this activity.',
    );
    this.name = 'BalletActivityRequirementError';
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
