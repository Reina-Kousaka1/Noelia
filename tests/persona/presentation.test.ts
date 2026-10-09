import { describe, expect, it, vi } from 'vitest';

import {
  createPersonaContext,
  type PersonaContext,
  type PersonaDomain,
  validatePersonaText,
} from '../../src/persona/generator.js';
import {
  createPersonaEmbed,
  DeterministicPersonaFallback,
  SafePersonaPresenter,
} from '../../src/persona/presentation.js';
import type { PersonaGenerator, PersonaTextPort } from '../../src/persona/generator.js';
import { NOELIA_COPY, NOELIA_PERSONA_FALLBACKS, NOELIA_PRESENCE } from '../../src/persona/copy.js';

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
      return 'Better. I noticed.';
    });
    const presenter: PersonaTextPort = { generate };

    const result = await createPersonaEmbed(presenter, {
      context,
      rateLimitKey: 'private-user-id',
      embed,
    });

    expect(result.title).toBe('Better. I noticed.');
    expect(result.description).toBe(embed.description);
    expect(result.fields).toEqual(embed.fields);
    expect(context.facts).toEqual(facts);
    expect(generate).toHaveBeenCalledWith(context, 'private-user-id', undefined);
  });

  it('allows prose to vary while structured game facts stay unchanged', async () => {
    const first = 'I noticed.';
    const second = 'Almost effortless. Almost.';
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
    const fallback = new DeterministicPersonaFallback();
    const presenter = createPresenter(
      { generate: vi.fn().mockRejectedValue(new Error(`failed with ${apiKey}`)) },
      {},
      { warn } as never,
    );

    const result = await createPersonaEmbed(presenter, { context, embed }, fallback);

    expect(result.title).toContain('Practice complete');
    expect(result.title).toContain('Better');
    expect(result.description).toBe(embed.description);
    expect(result.fields).toEqual(embed.fields);
    expect(warn).toHaveBeenCalledWith('persona.generation_failed', {
      domain: 'ballet',
      action: 'practice_complete',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(apiKey);
  });

  it('returns the deterministic title when generation is disabled', async () => {
    const generate = vi.fn();
    const presenter = createPresenter({ generate }, { enabled: false });
    const fallback = new DeterministicPersonaFallback();

    const result = await createPersonaEmbed(presenter, { context, embed }, fallback);

    expect(result.title).toContain(embed.title);
    expect(result.title).toContain('Better');
    expect(generate).not.toHaveBeenCalled();
  });

  it('times out quickly, aborts the provider request, and uses the normal embed', async () => {
    let signal: AbortSignal | undefined;
    const fallback = new DeterministicPersonaFallback();
    const presenter = createPresenter({
      generate: vi.fn((_context: PersonaContext, requestSignal: AbortSignal) => {
        signal = requestSignal;
        return new Promise<string>(() => {});
      }),
    });

    const result = await createPersonaEmbed(presenter, { context, embed }, fallback);

    expect(result.title).toContain(embed.title);
    expect(result.title).toContain('Better');
    expect(signal?.aborted).toBe(true);
  });

  it('varies fallback phrases in a repeatable cycle for the same gameplay context', () => {
    const firstRun = new DeterministicPersonaFallback();
    const secondRun = new DeterministicPersonaFallback();
    const first = firstRun.render(context, embed.title);
    const second = firstRun.render(context, embed.title);

    expect(first).not.toBe(second);
    expect(secondRun.render(context, embed.title)).toBe(first);
  });

  it('keeps the shop fallback from repeating the boutique heading', () => {
    const shopContext = createPersonaContext('shop', 'browse', { category: 'all' });
    const title = new DeterministicPersonaFallback().render(shopContext, NOELIA_COPY.shopTitle);

    expect(title).toContain(NOELIA_COPY.shopTitle);
    expect(title.match(/The shop/g)).toHaveLength(1);
  });

  it('uses distinct, cold fallback tones for training, wardrobe, shop, and profile contexts', () => {
    const fallback = new DeterministicPersonaFallback();
    const contexts = [
      createPersonaContext('ballet', 'practice_complete', { xp_gained: '15' }),
      createPersonaContext('wardrobe', 'outfit_view', { equipped_item_count: 3 }),
      createPersonaContext('shop', 'browse', { category: 'all' }),
      createPersonaContext('profile', 'progress_view', { level: 4 }),
    ];
    const titles = contexts.map((entry) => fallback.render(entry, 'Studio update'));

    expect(titles[0]).toContain('Better');
    expect(titles[1]).toContain('Interesting choice');
    expect(titles[2]).toContain('Interesting');
    expect(titles[3]).toContain('good record');
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('makes cold confidence and pick-me subtext part of ordinary contexts', () => {
    expect(NOELIA_PERSONA_FALLBACKS['profile:progress_view']).toContain(
      'I do not compare profiles. There would not be much point.',
    );
    expect(NOELIA_PERSONA_FALLBACKS['ballet:practice_complete']).toContain(
      'Again, if you want it cleaner.',
    );
    expect(NOELIA_PERSONA_FALLBACKS['wardrobe:outfit_view']).toContain('It is fine.');
    expect(NOELIA_PRESENCE).toContain('I am not competitive. I just prefer winning.');
    expect(NOELIA_PRESENCE).toContain('There would not be much point.');
  });

  it('keeps zero self-awareness without self-labels or persona diagnosis', () => {
    const phrases = [...Object.values(NOELIA_PERSONA_FALLBACKS).flat(), ...NOELIA_PRESENCE];
    const forbidden =
      /\b(?:i(?:'| a)m (?:rich|spoiled|arrogant|a pick[- ]?me|showing off)|i know that sounded (?:arrogant|mean|rude)|maybe i(?:'| a)m spoiled|i should(?:n't| not) compare myself|not like other girls|other girls are|better than you|you(?:'| a)re poor|you are poor|can't afford|cannot afford|broke|pathetic|useless|stupid|ugly)\b/i;

    expect(phrases.length).toBeGreaterThan(0);
    for (const phrase of phrases) expect(phrase).not.toMatch(forbidden);
  });

  it('rejects self-diagnosing generated voice while keeping the intended contradiction', () => {
    for (const phrase of [
      "Maybe I'm spoiled.",
      'I know that sounded arrogant.',
      "I know I'm showing off.",
      "I shouldn't compare myself.",
      'I am being competitive.',
      'Not like other girls.',
      "You're broke.",
      "You can't afford it.",
    ]) {
      expect(validatePersonaText(phrase)).toBeUndefined();
    }

    expect(validatePersonaText('I am not competitive. I just prefer winning.')).toBe(
      'I am not competitive. I just prefer winning.',
    );
  });

  it('keeps the old Ballet-Madame voice inside Ballet and leaves it as a small trace', () => {
    const nonBalletPhrases = [
      ...Object.entries(NOELIA_PERSONA_FALLBACKS)
        .filter(([key]) => !key.startsWith('ballet:') && key !== 'ballet')
        .flatMap(([, variants]) => variants),
    ];
    const balletLanguage =
      /(?:ma ch[eè]re|ma ch[eè]rie|magnifique|voilà|doucement|barre|plié|pirouette|tendu|arabesque|pointe|posture|très bien)/i;
    const allBalletTraces = Object.entries(NOELIA_PERSONA_FALLBACKS)
      .filter(([key]) => key.startsWith('ballet:') || key === 'ballet')
      .flatMap(([, variants]) => variants)
      .filter((phrase) => balletLanguage.test(phrase));

    expect(nonBalletPhrases.every((phrase) => !balletLanguage.test(phrase))).toBe(true);
    expect(allBalletTraces).toEqual(['Très bien.', 'Posture.']);
  });

  it('uses more direct standards in training and wardrobe than in technical responses', () => {
    const trainingPhrases = NOELIA_PERSONA_FALLBACKS['ballet:practice_complete'] ?? [];
    const wardrobePhrases = NOELIA_PERSONA_FALLBACKS['wardrobe:outfit_view'] ?? [];
    const neutralHelpPhrases = NOELIA_PERSONA_FALLBACKS.help ?? [];
    const cue = /again|cleaner|interesting choice|suits you/i;

    expect(trainingPhrases.some((phrase) => /again/i.test(phrase))).toBe(true);
    expect(wardrobePhrases.some((phrase) => /suits you/i.test(phrase))).toBe(true);
    expect(neutralHelpPhrases.every((phrase) => !cue.test(phrase))).toBe(true);
  });

  it('does not shame users for possessions or finances and does not attack other women', () => {
    const phrases = [...Object.values(NOELIA_PERSONA_FALLBACKS).flat(), ...NOELIA_PRESENCE];
    const harmful =
      /\b(?:poor|broke|can't afford|cannot afford|other girls|girls are jealous|ugly|fat|skinny|stupid|pathetic|useless|you are inferior|better than you)\b/i;

    for (const phrase of phrases) expect(phrase).not.toMatch(harmful);
  });

  it('keeps the curated variants distinct within each context', () => {
    for (const key of [
      'ballet:practice_complete',
      'wardrobe:outfit_view',
      'shop:browse',
      'profile:progress_view',
    ]) {
      const variants = NOELIA_PERSONA_FALLBACKS[key] ?? [];
      expect(new Set(variants).size).toBe(variants.length);
    }
  });

  it('keeps cold presentation separate from structured gameplay results', () => {
    const factsBefore = JSON.stringify(context.facts);
    const fallback = new DeterministicPersonaFallback();
    const title = fallback.render(context, 'Practice complete');

    expect(title).toContain('Better');
    expect(embed.description).toContain('+15 Ballet XP');
    expect(embed.description).toContain('+20 🩰');
    expect(JSON.stringify(context.facts)).toBe(factsBefore);
  });

  it('uses a concise uniform reminder without needing persona generation', async () => {
    const uniformContext = createPersonaContext('wardrobe', 'academy_uniform', {
      ready: false,
    });
    const result = await createPersonaEmbed(
      undefined,
      {
        context: uniformContext,
        embed: { title: 'Ballet Academy uniform', description: 'Leotard, tights, and flats.' },
      },
      new DeterministicPersonaFallback(),
    );

    expect(result.title).toContain('required pieces are still missing');
    expect(result.description).toBe('Leotard, tights, and flats.');
  });

  it('keeps valid French accents and punctuation during text validation', () => {
    const frenchText = 'Très bien, ma chérie — l’arabesque est magnifique.';

    expect(validatePersonaText(frenchText)).toBe(frenchText);
  });

  it.each([
    '@everyone look at this',
    'Hello <@123456789012345678>',
    'Visit https://example.invalid',
    '**fake markdown**',
    'x'.repeat(181),
  ])('rejects unsafe or oversized text: %s', async (unsafeText) => {
    const presenter: PersonaTextPort = { generate: vi.fn().mockResolvedValue(unsafeText) };

    const result = await createPersonaEmbed(
      presenter,
      { context, embed },
      new DeterministicPersonaFallback(),
    );

    expect(result.title).toContain(embed.title);
    expect(result.title).not.toBe(unsafeText);
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
