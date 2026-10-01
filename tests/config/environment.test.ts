import { describe, expect, it } from 'vitest';

import { EnvironmentValidationError, parseEnvironment } from '../../src/config/environment.js';

const validEnvironment: NodeJS.ProcessEnv = {
  DISCORD_TOKEN: 'test-discord-token',
  DISCORD_GUILD_ID: '123456789012345678',
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_DATABASE: 'noelia',
  POSTGRES_USER: 'noelia',
  POSTGRES_PASSWORD: ' test-password ',
};

describe('parseEnvironment', () => {
  it('validates and returns typed configuration without changing password bytes', () => {
    const config = parseEnvironment(validEnvironment);

    expect(config).toEqual({
      nodeEnvironment: 'development',
      discord: {
        token: 'test-discord-token',
        guildId: '123456789012345678',
      },
      postgres: {
        host: 'localhost',
        port: 5432,
        database: 'noelia',
        user: 'noelia',
        password: ' test-password ',
      },
    });
  });

  it('reports missing variable names without revealing supplied secrets', () => {
    const environment: NodeJS.ProcessEnv = {
      ...validEnvironment,
      DISCORD_TOKEN: 'do-not-echo-discord-secret',
      POSTGRES_PASSWORD: '',
    };

    try {
      parseEnvironment(environment);
      expect.fail('Expected invalid environment to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as Error).message).toContain('POSTGRES_PASSWORD');
      expect((error as Error).message).not.toContain('do-not-echo-discord-secret');
    }
  });

  it('rejects invalid ports, guild IDs, and runtime environments', () => {
    const environment: NodeJS.ProcessEnv = {
      ...validEnvironment,
      DISCORD_GUILD_ID: 'not-a-snowflake',
      POSTGRES_PORT: '70000',
      NODE_ENV: 'staging',
    };

    expect(() => parseEnvironment(environment)).toThrow(
      'DISCORD_GUILD_ID must be a 17- to 20-digit Discord ID',
    );
    expect(() => parseEnvironment(environment)).toThrow(
      'POSTGRES_PORT must be an integer from 1 to 65535',
    );
    expect(() => parseEnvironment(environment)).toThrow(
      'NODE_ENV must be development, test, or production',
    );
  });
});
