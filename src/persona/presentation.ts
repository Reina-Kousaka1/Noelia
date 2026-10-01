import type { EmbedOptions } from 'eris';

import type { NoeliaEmbedInput } from '../ui/embed.js';
import { createNoeliaEmbed } from '../ui/embed.js';
import type { StructuredLogger } from '../infrastructure/logging/logger.js';
import type {
  PersonaContext,
  PersonaDomain,
  PersonaFact,
  PersonaGenerator,
  PersonaTextPort,
} from './generator.js';
import { createPersonaContext, validatePersonaText } from './generator.js';

export interface PersonaPresenterOptions {
  readonly enabled: boolean;
  readonly generator?: PersonaGenerator;
  readonly timeoutMs: number;
  readonly maxConcurrent: number;
  readonly maxRequestsPerMinute: number;
  readonly userCooldownMs?: number;
}

export class SafePersonaPresenter implements PersonaTextPort {
  private active = 0;
  private readonly starts: number[] = [];
  private readonly lastByUser = new Map<string, number>();
  private readonly userCooldownMs: number;

  public constructor(
    private readonly options: PersonaPresenterOptions,
    private readonly logger?: Pick<StructuredLogger, 'warn'>,
    private readonly now: () => number = Date.now,
    private readonly secrets: readonly string[] = [],
  ) {
    this.userCooldownMs = options.userCooldownMs ?? 2_500;
  }

  public async generate(
    context: PersonaContext,
    rateLimitKey?: string,
    timeoutMs = this.options.timeoutMs,
  ): Promise<string | undefined> {
    const generator = this.options.generator;

    if (!this.options.enabled || generator === undefined || !this.canStart(rateLimitKey)) {
      return undefined;
    }

    this.active += 1;
    const controller = new AbortController();
    const boundedTimeout = Math.min(Math.max(1, timeoutMs), this.options.timeoutMs);
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(undefined);
        }, boundedTimeout);
      });

      const response = await Promise.race([
        generator.generate(context, controller.signal),
        timeout,
      ]);
      const text = validatePersonaText(response, this.secrets);

      if (text === undefined && response !== undefined) {
        this.logger?.warn('persona.output_rejected', {
          domain: context.domain,
          action: context.action,
        });
      }

      return text;
    } catch {
      // Provider errors can contain request details, so only fixed event metadata is logged.
      this.logger?.warn('persona.generation_failed', {
        domain: context.domain,
        action: context.action,
      });
      return undefined;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
      this.active -= 1;
    }
  }

  private canStart(rateLimitKey?: string): boolean {
    if (
      !this.options.enabled ||
      this.options.generator === undefined ||
      this.active >= this.options.maxConcurrent
    ) {
      return false;
    }

    const now = this.now();
    while (this.starts.length > 0 && this.starts[0]! <= now - 60_000) this.starts.shift();

    if (this.starts.length >= this.options.maxRequestsPerMinute) return false;

    for (const [user, lastRequest] of this.lastByUser) {
      if (lastRequest <= now - this.userCooldownMs) this.lastByUser.delete(user);
    }

    if (rateLimitKey !== undefined) {
      const lastRequest = this.lastByUser.get(rateLimitKey);
      if (lastRequest !== undefined && lastRequest > now - this.userCooldownMs) return false;
      this.lastByUser.set(rateLimitKey, now);

      // The global request cap keeps this bounded in normal operation; retain a hard ceiling too.
      if (this.lastByUser.size > 1_000) {
        const oldest = this.lastByUser.keys().next().value;
        if (oldest !== undefined) this.lastByUser.delete(oldest);
      }
    }

    this.starts.push(now);
    return true;
  }
}

export interface PersonaEmbedRequest {
  readonly context: PersonaContext;
  readonly rateLimitKey?: string;
  readonly timeoutMs?: number;
  readonly embed: NoeliaEmbedInput;
}

export async function createPersonaEmbed(
  presenter: PersonaTextPort | undefined,
  request: PersonaEmbedRequest,
): Promise<EmbedOptions> {
  let title = request.embed.title;

  if (presenter !== undefined) {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), request.timeoutMs ?? 2_000);
      });
      const candidate = await Promise.race([
        presenter.generate(request.context, request.rateLimitKey, request.timeoutMs),
        timeout,
      ]);
      title = validatePersonaText(candidate) ?? title;
    } catch {
      // Keep command rendering independent from any injected or configured text provider.
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return createNoeliaEmbed({ ...request.embed, title });
}

export async function renderPersonaEmbed(
  presenter: PersonaTextPort | undefined,
  domain: PersonaDomain,
  action: string,
  facts: Readonly<Record<string, PersonaFact>>,
  embed: NoeliaEmbedInput,
  rateLimitKey?: string,
  timeoutMs?: number,
): Promise<EmbedOptions> {
  return createPersonaEmbed(presenter, {
    context: createPersonaContext(domain, action, facts),
    embed,
    ...(rateLimitKey === undefined ? {} : { rateLimitKey }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

export function createPersonaEmbedRenderer(
  presenter: PersonaTextPort | undefined,
  domain: PersonaDomain,
  rateLimitKey?: string,
): (
  action: string,
  facts: Readonly<Record<string, PersonaFact>>,
  embed: NoeliaEmbedInput,
) => Promise<EmbedOptions> {
  return (action, facts, embed) =>
    renderPersonaEmbed(presenter, domain, action, facts, embed, rateLimitKey);
}
