import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class MarriageSelfProposalError extends ExpectedDomainError {
  public constructor() {
    super('A user attempted to propose to themselves.', 'You cannot propose to yourself.');
    this.name = 'MarriageSelfProposalError';
  }
}

export class MarriageParticipantUnavailableError extends ExpectedDomainError {
  public constructor() {
    super(
      'A relationship participant is married or has a pending proposal.',
      'One of you is already married or has another pending proposal.',
    );
    this.name = 'MarriageParticipantUnavailableError';
  }
}

export class MarriageProposalNotFoundError extends ExpectedDomainError {
  public constructor() {
    super('The relationship proposal does not exist.', 'That proposal could not be found.');
    this.name = 'MarriageProposalNotFoundError';
  }
}

export class MarriageProposalActorError extends ExpectedDomainError {
  public constructor() {
    super(
      'The interaction actor is not authorized for this relationship proposal.',
      'Only the person this proposal was sent to can answer it; only its sender can cancel it.',
    );
    this.name = 'MarriageProposalActorError';
  }
}

export class MarriageProposalUnavailableError extends ExpectedDomainError {
  public constructor() {
    super('The relationship proposal is no longer pending.', 'That proposal is no longer pending.');
    this.name = 'MarriageProposalUnavailableError';
  }
}

export class MarriageNotFoundError extends ExpectedDomainError {
  public constructor() {
    super('The user has no active relationship.', 'There is no active marriage to end.');
    this.name = 'MarriageNotFoundError';
  }
}

export class RelationshipIdempotencyConflictError extends ExpectedDomainError {
  public constructor() {
    super(
      'A Discord interaction ID was reused for a different relationship operation.',
      'This action could not be safely repeated. Please try again from the command.',
    );
    this.name = 'RelationshipIdempotencyConflictError';
  }
}

export class RelationshipProposalIdError extends ExpectedDomainError {
  public constructor() {
    super('The relationship proposal ID is invalid.', 'That proposal ID is not valid.');
    this.name = 'RelationshipProposalIdError';
  }
}
