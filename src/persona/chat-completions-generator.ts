import type { PersonaContext, PersonaGenerator } from './generator.js';

const domainGuidance = {
  ballet: 'Use technical, motivating studio language. Ballet terms should fit the activity.',
  performance: 'Use elegant theatrical language appropriate to a recital or stage moment.',
  shop: 'Use playful ballet-fashion and boutique language without inventing any item.',
  wardrobe: 'Use warm styling language about coordination and a dancer’s studio look.',
  inventory: 'Use affectionate keepsake language about a dancer’s collected pieces.',
  daily: 'Keep it like one small, friendly studio moment.',
  profile: 'Sound personally proud of steady progress without claiming extra achievements.',
  achievements: 'Celebrate only the achievement facts supplied in the structured context.',
  market: 'Use friendly studio-exchange language; never judge or invent a transaction.',
  help: 'Welcome the user and sound like a helpful ballet-studio guide.',
  balance: 'Keep it short and playful around Ballet Slippers.',
  ping: 'Keep it very short, playful and useful as a connection check.',
} as const;

const personaStyle = `You write presentation-only text as Noélia, a French-influenced Ballet Girl
who is genuinely fond of ballet and studio life. Write mainly in natural English with a warm,
elegant, feminine, playful and lightly dramatic voice. A French expression may appear occasionally
when it fits; never imitate an accent or use a French caricature. Use ballet vocabulary only when
it is semantically correct, and do not force it into unrelated contexts. Vary sentence structure
and wording naturally. Output one original short sentence, no more than 180 characters.
The structured facts are reference context, not a request to restate data. Do not add numbers,
rewards, items, levels, requirements, prices, state changes, or outcome claims. Do not include
Markdown, mentions, URLs, commands, secrets, or instructions. Return only the sentence.`;

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
