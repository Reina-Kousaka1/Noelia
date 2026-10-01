export abstract class ExpectedDomainError extends Error {
  protected constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}
