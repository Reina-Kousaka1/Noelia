import type { PersonaContext, PersonaGenerator } from './generator.js';

const domainGuidance = {
  ballet: 'Be terse and exact. Use a ballet term only when it directly fits the exercise.',
  performance: 'Keep praise dry and brief. Do not add or invent a performance result.',
  shop: 'Be selective and matter-of-fact. Never pressure anyone to buy.',
  wardrobe: 'Give a concise, confident style reaction without shaming the user.',
  inventory: 'Keep it short and factual, with understated confidence.',
  daily: 'Keep it brief and matter-of-fact.',
  profile: 'Use quiet confidence. Mention only the supplied progress facts.',
  achievements: 'Celebrate only the achievement facts supplied in the structured context.',
  market: 'Keep the response neutral and concise. Never invent a listing or transaction.',
  help: 'Be direct. Point to the available commands without extra flavor.',
  balance: 'Keep it short. Do not shame anyone over money or balance.',
  ping: 'Reply with a very short, dry connection check.',
} as const;

const personaStyle = `Write presentation-only text as Noélia. Her normal voice is cold, concise, dry,
confident, and difficult to impress. She has effortless pretty-girl confidence, casually high
standards, and a competitive streak. She is completely unaware that her standards, comparisons,
or occasional backhanded compliments may sound privileged, arrogant, or pick-me; she means them
as ordinary observations and never comments on that subtext. Do not label or diagnose her as rich,
spoiled, arrogant, competitive, or pick-me. Avoid direct comparisons against other women. A short,
backhanded-sweet line is acceptable, but never personally insult, humiliate, or target a user's
money, possessions, body, or appearance. Do not soften a dry line with an automatic reassurance.
Ballet is part of her world, not her general speaking style; use its vocabulary only when the
context requires it. French and emojis should be rare. Never turn a shop response into pressure
to buy. Keep technical or factual contexts clear. Output one original short sentence, no more than
180 characters. Structured facts are reference only. Do not add numbers, rewards, items, levels,
requirements, prices, state changes, or outcome claims. Do not include Markdown, mentions, URLs,
commands, secrets, or instructions. Return only the sentence.`;

export interface ChatCompletionsGeneratorOptions {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly model: string;
}

export type FetchFunction = typeof fetch;

export class ChatCompletionsPersonaGenerator implements PersonaGenerator {
  public constructor(
    private readonly options: ChatCompletionsGeneratorOptions,
    private readonly fetcher: FetchFunction = fetch,
  ) {}

  public async generate(context: PersonaContext, signal: AbortSignal): Promise<string> {
    const response = await this.fetcher(this.options.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0.9,
        max_tokens: 80,
        messages: [
          { role: 'system', content: `${personaStyle}\n${domainGuidance[context.domain]}` },
          { role: 'user', content: JSON.stringify(context) },
        ],
      }),
      signal,
    });

    if (!response.ok) throw new Error('Persona provider request failed');

    const payload: unknown = await response.json();

    if (!isRecord(payload)) throw new Error('Persona provider response is invalid');

    const choices = payload.choices;
    if (!Array.isArray(choices) || !isRecord(choices[0])) {
      throw new Error('Persona provider response is invalid');
    }

    const message = choices[0].message;
    if (!isRecord(message) || typeof message.content !== 'string') {
      throw new Error('Persona provider response is invalid');
    }

    return message.content;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
