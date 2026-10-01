import { BALLET_ACTIVITY_CODES } from '../ballet/activity-codes.js';
import { BALLET_STAT_KEYS } from '../ballet/types.js';
import { SHOP_CATEGORIES } from '../shop/types.js';
import { SHOP_RARITIES } from '../shop/rarity.js';
import { WARDROBE_SLOTS } from '../wardrobe/types.js';

export const PERSONA_DOMAINS = [
  'ballet',
  'performance',
  'shop',
  'wardrobe',
  'inventory',
  'daily',
  'profile',
  'achievements',
  'market',
  'help',
  'balance',
  'ping',
] as const;

export type PersonaDomain = (typeof PERSONA_DOMAINS)[number];
export type PersonaFact = string | number | boolean | null;

export interface PersonaContext {
  readonly domain: PersonaDomain;
  readonly action: string;
  readonly facts: Readonly<Record<string, PersonaFact>>;
}

export interface PersonaGenerator {
  generate(context: PersonaContext, signal: AbortSignal): Promise<string>;
}

export interface PersonaTextPort {
  generate(
    context: PersonaContext,
    rateLimitKey?: string,
    timeoutMs?: number,
  ): Promise<string | undefined>;
}

const factKeyPattern = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const integerFactPattern = /^\d{1,24}$/;
const safeEnumFacts: Readonly<Record<string, ReadonlySet<string>>> = {
  activity: new Set(BALLET_ACTIVITY_CODES.map((code) => code.replaceAll('-', '_'))),
  category: new Set([...SHOP_CATEGORIES, 'all']),
  rarity: new Set(SHOP_RARITIES),
  slot: new Set(WARDROBE_SLOTS),
  stat: new Set(BALLET_STAT_KEYS),
  tier: new Set(['bronze', 'silver', 'gold', 'prima']),
};

export function createPersonaContext(
  domain: PersonaDomain,
  action: string,
  facts: Readonly<Record<string, PersonaFact>>,
): PersonaContext {
  if (!(PERSONA_DOMAINS as readonly string[]).includes(domain)) {
    throw new Error('Invalid persona domain');
  }

  if (!/^[a-z][a-z0-9_]{0,39}$/.test(action)) {
    throw new Error('Invalid persona action');
  }

  const safeFacts = Object.fromEntries(
    Object.entries(facts)
      .filter(([key, value]) => {
        if (!factKeyPattern.test(key)) return false;
        if (typeof value === 'string') {
          return safeEnumFacts[key]?.has(value) ?? integerFactPattern.test(value);
        }
        if (typeof value === 'number') return Number.isFinite(value);
        return typeof value === 'boolean' || value === null;
      })
      .slice(0, 12),
  );

  return Object.freeze({
    domain,
    action,
    facts: Object.freeze(safeFacts),
  });
}

export function validatePersonaText(
  candidate: unknown,
  secrets: readonly string[] = [],
): string | undefined {
  if (typeof candidate !== 'string') return undefined;

  const text = candidate.trim().replace(/\s+/g, ' ');
  const length = Array.from(text).length;

  if (length === 0 || length > 180) return undefined;
  // Discord titles should not contain control characters.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F<>@`*_~#[\]\\|]/u.test(text)) return undefined;
  if (
    /(?:https?|ftp):\/\/|www\.|discord(?:app)?\.com\/invite|\b[a-z0-9.-]+\.[a-z]{2,}(?:\/|\b)/i.test(
      text,
    )
  ) {
    return undefined;
  }
  if (/\b(?:sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9]{12,}|xox[baprs]-[a-z0-9-]{12,})\b/i.test(text)) {
    return undefined;
  }
  if (/\b(?:api[_ -]?key|authorization|password|secret)\s*[:=]/i.test(text)) return undefined;
  if (secrets.some((secret) => secret.length > 0 && text.includes(secret))) return undefined;

  return text;
}
