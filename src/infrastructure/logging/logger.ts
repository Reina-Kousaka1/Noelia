export type LogValue = string | number | boolean | null | undefined;
export type LogFields = Readonly<Record<string, LogValue>>;

const sensitiveFieldName = /(token|password|secret|credential|authorization)/i;
const discordTokenPattern = /\b[\w-]{24,}\.[\w-]{6,}\.[\w-]{20,}\b/g;
const namedSecretPattern =
  /\b(token|password|secret|authorization)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;
const postgresCredentialPattern = /\b(postgres(?:ql)?:\/\/)[^/\s@]+@/gi;

export function redactSensitiveText(text: string, knownSecrets: readonly string[] = []): string {
  let redacted = text;

  for (const secret of [...knownSecrets].sort((left, right) => right.length - left.length)) {
    if (secret.length > 0) {
      redacted = redacted.replaceAll(secret, '[REDACTED]');
    }
  }

  return redacted
    .replace(discordTokenPattern, '[REDACTED_DISCORD_TOKEN]')
    .replace(namedSecretPattern, '$1$2[REDACTED]')
    .replace(postgresCredentialPattern, '$1[REDACTED]@');
}

export class StructuredLogger {
  public constructor(private readonly knownSecrets: readonly string[] = []) {}

  public info(event: string, fields: LogFields = {}): void {
    this.write('info', event, fields);
  }

  public warn(event: string, fields: LogFields = {}): void {
    this.write('warn', event, fields);
  }

  public error(event: string, error: unknown, fields: LogFields = {}): void {
    const errorFields =
      error instanceof Error
        ? {
            errorName: error.name,
            errorMessage: redactSensitiveText(error.message, this.knownSecrets),
            ...(error.stack === undefined
              ? {}
              : { errorStack: redactSensitiveText(error.stack, this.knownSecrets) }),
          }
        : { errorName: 'NonErrorThrown', errorMessage: 'A non-Error value was thrown' };

    this.write('error', event, { ...fields, ...errorFields });
  }

  private write(level: 'info' | 'warn' | 'error', event: string, fields: LogFields): void {
    const safeFields = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        sensitiveFieldName.test(key)
          ? '[REDACTED]'
          : typeof value === 'string'
            ? redactSensitiveText(value, this.knownSecrets)
            : value,
      ]),
    );
    const entry = {
      ...safeFields,
      timestamp: new Date().toISOString(),
      level,
      event,
    };
    const output = JSON.stringify(entry);

    if (level === 'error') {
      console.error(output);
      return;
    }

    if (level === 'warn') {
      console.warn(output);
      return;
    }

    console.info(output);
  }
}

export function createLogger(knownSecrets: readonly string[] = []): StructuredLogger {
  return new StructuredLogger(knownSecrets);
}
