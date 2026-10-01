import { describe, expect, it, vi } from 'vitest';

import {
  createPersonaContext,
  type PersonaContext,
  type PersonaDomain,
} from '../../src/persona/generator.js';
import { createPersonaEmbed, SafePersonaPresenter } from '../../src/persona/presentation.js';
import type { PersonaGenerator, PersonaTextPort } from '../../src/persona/generator.js';

const context = createPersonaContext('ballet', 'practice_complete', {
  activity: 'class',
  xp_gained: '15',
  slippers_gained: '20',
  stat: 'technique',
  stat_gain: 2,
  level: 1,
  xp_to_next_level: '85',
});

const embed = {
  title: 'Practice complete',
  description:
    'Ballet class · +15 Ballet XP · +20 🩰\nTechnique · +2\nLevel 1 · 85 XP to next level.',
  fields: [{ name: 'Technique', value: '2/100', inline: true }],
};

function createPresenter(
  generator: PersonaGenerator,
  overrides: Partial<ConstructorParameters<typeof SafePersonaPresenter>[0]> = {},
  logger?: Pick<import('../../src/infrastructure/logging/logger.js').StructuredLogger, 'warn'>,
  now?: () => number,
) {
  return new SafePersonaPresenter(
    {
      enabled: true,
      generator,
      timeoutMs: 25,
      maxConcurrent: 2,
      maxRequestsPerMinute: 12,
      ...overrides,
    },
    logger,
    now,
  );
}

describe('persona presentation', () => {
  it('passes structured command facts and preserves all factual embed content', async () => {
    const facts = context.facts;
    const generate = vi.fn(async (received: PersonaContext) => {
      expect(received).toEqual(context);
      return 'Très bien, that class had such lovely energy.';
    });
    const presenter: PersonaTextPort = { generate };

    const result = await createPersonaEmbed(presenter, {
      context,
      rateLimitKey: 'private-user-id',
      embed,
    });

    expect(result.title).toBe('Très bien, that class had such lovely energy.');
    expect(result.description).toBe(embed.description);
    expect(result.fields).toEqual(embed.fields);
    expect(context.facts).toEqual(facts);
    expect(generate).toHaveBeenCalledWith(context, 'private-user-id', undefined);
  });

  it('allows prose to vary while structured game facts stay unchanged', async () => {
    const first = 'The studio is glowing after that class.';
    const second = 'A graceful class, ma chérie.';
    const presenter: PersonaTextPort = {
      generate: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
    };
    const before = JSON.stringify(context.facts);

    const firstEmbed = await createPersonaEmbed(presenter, { context, embed });
    const secondEmbed = await createPersonaEmbed(presenter, { context, embed });

    expect(firstEmbed.title).toBe(first);
    expect(secondEmbed.title).toBe(second);
    expect(firstEmbed.description).toBe(secondEmbed.description);
    expect(JSON.stringify(context.facts)).toBe(before);
  });

  it('falls back after provider failure and logs no provider details or credentials', async () => {
    const apiKey = 'provider-secret-value';
    const warn = vi.fn();
    const presenter = createPresenter(
      { generate: vi.fn().mockRejectedValue(new Error(`failed with ${apiKey}`)) },
      {},
      { warn } as never,
    );

    const result = await createPersonaEmbed(presenter, { context, embed });

    expect(result.title).toBe(embed.title);
    expect(warn).toHaveBeenCalledWith('persona.generation_failed', {
      domain: 'ballet',
      action: 'practice_complete',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(apiKey);
  });

  it('returns the deterministic title when generation is disabled', async () => {
    const generate = vi.fn();
    const presenter = createPresenter({ generate }, { enabled: false });

    const result = await createPersonaEmbed(presenter, { context, embed });

    expect(result.title).toBe(embed.title);
    expect(generate).not.toHaveBeenCalled();
  });

  it('times out quickly, aborts the provider request, and uses the normal embed', async () => {
    let signal: AbortSignal | undefined;
    const presenter = createPresenter({
      generate: vi.fn((_context: PersonaContext, requestSignal: AbortSignal) => {
        signal = requestSignal;
        return new Promise<string>(() => {});
      }),
    });

    const result = await createPersonaEmbed(presenter, { context, embed });

    expect(result.title).toBe(embed.title);
    expect(signal?.aborted).toBe(true);
  });

  it.each([
    '@everyone look at this',
    'Hello <@123456789012345678>',
    'Visit https://example.invalid',
    '**fake markdown**',
    'x'.repeat(181),
  ])('rejects unsafe or oversized text: %s', async (unsafeText) => {
    const presenter: PersonaTextPort = { generate: vi.fn().mockResolvedValue(unsafeText) };

    const result = await createPersonaEmbed(presenter, { context, embed });

    expect(result.title).toBe(embed.title);
    expect(result.description).toBe(embed.description);
  });

  it('enforces the allowed semantic domains and never accepts moderation contexts', async () => {
    const generator = vi.fn();

    expect(() =>
      createPersonaContext('moderation' as PersonaDomain, 'ban', { result: 'done' }),
    ).toThrow('Invalid persona domain');
    expect(generator).not.toHaveBeenCalled();
  });

  it('limits concurrent requests and rate limits a user without queuing commands', async () => {
    let release: ((value: string) => void) | undefined;
    let now = 10_000;
    const generate = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue('Another quiet studio note.');
    const presenter = createPresenter(
      { generate },
      { maxConcurrent: 1, maxRequestsPerMinute: 1 },
      undefined,
      () => now,
    );

    const pending = presenter.generate(context, 'user-a');
    await expect(presenter.generate(context, 'user-b')).resolves.toBeUndefined();
    release?.('The first performance stays in progress.');
    await expect(pending).resolves.toBe('The first performance stays in progress.');

    now += 2_501;
    await expect(presenter.generate(context, 'user-b')).resolves.toBeUndefined();
    now += 60_001;
    await expect(presenter.generate(context, 'user-a')).resolves.toBe('Another quiet studio note.');
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
