import { existsSync } from 'node:fs';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface AppConfig {
  readonly nodeEnvironment: NodeEnvironment;
  readonly discord: {
    readonly token: string;
    readonly guildId: string;
  };
  readonly postgres: {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string;
  };
  readonly persona: {
    readonly generationEnabled: boolean;
    readonly endpoint?: string;
    readonly apiKey?: string;
    readonly model?: string;
    readonly timeoutMs: number;
    readonly maxConcurrent: number;
    readonly maxRequestsPerMinute: number;
  };
  readonly automod: {
    readonly messageScanningEnabled: boolean;
    readonly joinMonitoringEnabled: boolean;
  };
}

export class EnvironmentValidationError extends Error {
  public readonly problems: readonly string[];

  public constructor(problems: readonly string[]) {
    super(`Invalid environment configuration: ${problems.join('; ')}`);
    this.name = 'EnvironmentValidationError';
    this.problems = [...problems];
  }
}

export class EnvironmentFileError extends Error {
  public constructor() {
    super('Unable to load the local .env file. Check its syntax and permissions.');
    this.name = 'EnvironmentFileError';
  }
}

function readRequired(
  environment: NodeJS.ProcessEnv,
  name: string,
  problems: string[],
  preserveWhitespace = false,
): string | undefined {
  const value = environment[name];

  if (value === undefined || value.trim().length === 0) {
    problems.push(`${name} is required`);
    return undefined;
  }

  return preserveWhitespace ? value : value.trim();
}

function readBoundedInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  problems: string[],
): number {
  const text = environment[name]?.trim();
  if (text === undefined || text.length === 0) return fallback;

  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    problems.push(`${name} must be an integer from ${minimum} to ${maximum}`);
    return fallback;
  }

  return value;
}

function readBoolean(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
  problems: string[],
): boolean {
  const text = environment[name]?.trim().toLowerCase();
  if (text === undefined || text.length === 0) return fallback;
  if (text === 'true') return true;
  if (text === 'false') return false;
  problems.push(`${name} must be true or false`);
  return fallback;
}

export function parseEnvironment(environment: NodeJS.ProcessEnv): AppConfig {
  const problems: string[] = [];
  const generationText = environment.PERSONA_GENERATION_ENABLED?.trim().toLowerCase() ?? 'false';
  const generationEnabled = generationText === 'true';

  if (generationText !== 'true' && generationText !== 'false') {
    problems.push('PERSONA_GENERATION_ENABLED must be true or false');
  }

  let personaEndpoint: string | undefined;
  let personaApiKey: string | undefined;
  let personaModel: string | undefined;

  if (generationEnabled) {
    personaEndpoint = readRequired(environment, 'PERSONA_GENERATION_ENDPOINT', problems);
    personaApiKey = readRequired(environment, 'PERSONA_GENERATION_API_KEY', problems);
    personaModel = readRequired(environment, 'PERSONA_GENERATION_MODEL', problems);

    if (personaEndpoint !== undefined) {
      try {
        const endpoint = new URL(personaEndpoint);
        const localHttp =
          endpoint.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname) &&
          environment.NODE_ENV?.trim() !== 'production';
        const hasCredentialQuery = [...endpoint.searchParams.keys()].some((key) =>
          /(?:token|key|secret|password|auth)/i.test(key),
        );

        if (
          (endpoint.protocol !== 'https:' && !localHttp) ||
          endpoint.username.length > 0 ||
          endpoint.password.length > 0 ||
          endpoint.hash.length > 0 ||
          hasCredentialQuery
        ) {
          problems.push('PERSONA_GENERATION_ENDPOINT must be a safe HTTPS endpoint');
        }
      } catch {
        problems.push('PERSONA_GENERATION_ENDPOINT must be a valid HTTPS endpoint');
      }
    }
  }

  const personaTimeoutMs = readBoundedInteger(
    environment,
    'PERSONA_GENERATION_TIMEOUT_MS',
    1_100,
    100,
    2_000,
    problems,
  );
  const personaMaxConcurrent = readBoundedInteger(
    environment,
    'PERSONA_GENERATION_MAX_CONCURRENT',
    2,
    1,
    4,
    problems,
  );
  const personaMaxRequestsPerMinute = readBoundedInteger(
    environment,
    'PERSONA_GENERATION_MAX_PER_MINUTE',
    20,
    1,
    60,
    problems,
  );
  const automodMessageScanningEnabled = readBoolean(
    environment,
    'AUTOMOD_MESSAGE_SCANNING_ENABLED',
    false,
    problems,
  );
  const antiRaidJoinMonitoringEnabled = readBoolean(
    environment,
    'ANTI_RAID_JOIN_MONITORING_ENABLED',
    false,
    problems,
  );
  const discordToken = readRequired(environment, 'DISCORD_TOKEN', problems);
  const guildId = readRequired(environment, 'DISCORD_GUILD_ID', problems);
  const postgresHost = readRequired(environment, 'POSTGRES_HOST', problems);
  const postgresDatabase = readRequired(environment, 'POSTGRES_DATABASE', problems);
  const postgresUser = readRequired(environment, 'POSTGRES_USER', problems);
  const postgresPassword = readRequired(environment, 'POSTGRES_PASSWORD', problems, true);

  const postgresPortText = readRequired(environment, 'POSTGRES_PORT', problems);
  const postgresPort = postgresPortText === undefined ? Number.NaN : Number(postgresPortText);

  if (
    postgresPortText !== undefined &&
    (!/^\d+$/.test(postgresPortText) ||
      !Number.isSafeInteger(postgresPort) ||
      postgresPort < 1 ||
      postgresPort > 65_535)
  ) {
    problems.push('POSTGRES_PORT must be an integer from 1 to 65535');
  }

  if (guildId !== undefined && !/^\d{17,20}$/.test(guildId)) {
    problems.push('DISCORD_GUILD_ID must be a 17- to 20-digit Discord ID');
  }

  const nodeEnvironmentText = environment.NODE_ENV?.trim() || 'development';
  const validNodeEnvironments: readonly NodeEnvironment[] = ['development', 'test', 'production'];
  const nodeEnvironment = validNodeEnvironments.find(
    (candidate) => candidate === nodeEnvironmentText,
  );

  if (nodeEnvironment === undefined) {
    problems.push('NODE_ENV must be development, test, or production');
  }

  if (problems.length > 0) {
    throw new EnvironmentValidationError(problems);
  }

  return {
    nodeEnvironment: nodeEnvironment!,
    discord: {
      token: discordToken!,
      guildId: guildId!,
    },
    postgres: {
      host: postgresHost!,
      port: postgresPort,
      database: postgresDatabase!,
      user: postgresUser!,
      password: postgresPassword!,
    },
    persona: {
      generationEnabled,
      ...(personaEndpoint === undefined ? {} : { endpoint: personaEndpoint }),
      ...(personaApiKey === undefined ? {} : { apiKey: personaApiKey }),
      ...(personaModel === undefined ? {} : { model: personaModel }),
      timeoutMs: personaTimeoutMs,
      maxConcurrent: personaMaxConcurrent,
      maxRequestsPerMinute: personaMaxRequestsPerMinute,
    },
    automod: {
      messageScanningEnabled: automodMessageScanningEnabled,
      joinMonitoringEnabled: antiRaidJoinMonitoringEnabled,
    },
  };
}

export function loadEnvironmentConfig(): AppConfig {
  if (existsSync('.env')) {
    try {
      process.loadEnvFile('.env');
    } catch {
      throw new EnvironmentFileError();
    }
  }

  return parseEnvironment(process.env);
}
