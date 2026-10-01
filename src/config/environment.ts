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

export function parseEnvironment(environment: NodeJS.ProcessEnv): AppConfig {
  const problems: string[] = [];
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
