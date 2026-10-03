import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export class KnowledgeLessonNotFoundError extends ExpectedDomainError {
  public constructor() {
    super('The selected Academy lesson does not exist.', 'That Academy lesson is not available.');
    this.name = 'KnowledgeLessonNotFoundError';
  }
}

export class KnowledgeAnswerNotFoundError extends ExpectedDomainError {
  public constructor() {
    super(
      'The selected answer does not belong to this lesson.',
      'Choose one of the lesson answers.',
    );
    this.name = 'KnowledgeAnswerNotFoundError';
  }
}

export class KnowledgeIdempotencyConflictError extends ExpectedDomainError {
  public constructor() {
    super(
      'The interaction ID was reused for a different Academy answer.',
      'That interaction could not be replayed. Please try the lesson again.',
    );
    this.name = 'KnowledgeIdempotencyConflictError';
  }
}
