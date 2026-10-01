import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class AchievementNotUnlockedError extends ExpectedDomainError {
  public constructor() {
    super(
      'The user tried to feature an achievement they have not unlocked.',
      'Unlock that achievement before featuring it on your profile.',
    );
    this.name = 'AchievementNotUnlockedError';
  }
}

export class AchievementUnknownError extends ExpectedDomainError {
  public constructor() {
    super('The requested achievement does not exist.', 'That achievement was not found.');
    this.name = 'AchievementUnknownError';
  }
}
