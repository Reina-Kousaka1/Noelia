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
      persona: {
        generationEnabled: false,
        timeoutMs: 1100,
        maxConcurrent: 2,
        maxRequestsPerMinute: 20,
      },
    });
  });

  it('keeps persona generation disabled without requiring provider credentials', () => {
    const { persona } = parseEnvironment(validEnvironment);

    expect(persona).toEqual({
      generationEnabled: false,
      timeoutMs: 1100,
      maxConcurrent: 2,
      maxRequestsPerMinute: 20,
    });
  });

  it('requires a safe provider endpoint and credentials only when generation is enabled', () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, PERSONA_GENERATION_ENABLED: 'true' }),
    ).toThrow('PERSONA_GENERATION_API_KEY is required');

    const config = parseEnvironment({
      ...validEnvironment,
      PERSONA_GENERATION_ENABLED: 'true',
      PERSONA_GENERATION_ENDPOINT: 'https://provider.example/v1/chat/completions',
      PERSONA_GENERATION_API_KEY: 'private-provider-key',
      PERSONA_GENERATION_MODEL: 'persona-test',
      PERSONA_GENERATION_TIMEOUT_MS: '900',
      PERSONA_GENERATION_MAX_CONCURRENT: '3',
      PERSONA_GENERATION_MAX_PER_MINUTE: '12',
    });

    expect(config.persona).toEqual({
      generationEnabled: true,
      endpoint: 'https://provider.example/v1/chat/completions',
      apiKey: 'private-provider-key',
      model: 'persona-test',
      timeoutMs: 900,
      maxConcurrent: 3,
      maxRequestsPerMinute: 12,
    });
  });

  it('does not echo provider credentials in configuration errors', () => {
    const providerKey = 'private-provider-key';

    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        PERSONA_GENERATION_ENABLED: 'true',
        PERSONA_GENERATION_ENDPOINT: 'file:///tmp/secret',
        PERSONA_GENERATION_API_KEY: providerKey,
        PERSONA_GENERATION_MODEL: 'persona-test',
      }),
    ).toThrow(/PERSONA_GENERATION_ENDPOINT/);

    try {
      parseEnvironment({
        ...validEnvironment,
        PERSONA_GENERATION_ENABLED: 'true',
        PERSONA_GENERATION_ENDPOINT: 'file:///tmp/secret',
        PERSONA_GENERATION_API_KEY: providerKey,
        PERSONA_GENERATION_MODEL: 'persona-test',
      });
    } catch (error) {
      expect((error as Error).message).not.toContain(providerKey);
    }
  });

  it('rejects credential query parameters on the provider endpoint', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        PERSONA_GENERATION_ENABLED: 'true',
        PERSONA_GENERATION_ENDPOINT: 'https://provider.example/v1/chat?api_key=secret-value',
        PERSONA_GENERATION_API_KEY: 'private-provider-key',
        PERSONA_GENERATION_MODEL: 'persona-test',
      }),
    ).toThrow(/PERSONA_GENERATION_ENDPOINT/);
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
