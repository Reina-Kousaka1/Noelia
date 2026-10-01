import { createHmac, randomBytes } from 'node:crypto';

import type { AutomodDetection, AutomodGuildConfig, AutomodRuleKey } from './types.js';

interface MessageEvent {
  readonly at: number;
  readonly contentHash: string;
  readonly mentionCount: number;
  readonly hasInvite: boolean;
}

export interface AutomodMessageInput {
  readonly guildId: string;
  readonly userId: string;
  readonly content: string;
  readonly mentionCount: number;
  readonly occurredAt: Date;
  readonly isBot: boolean;
  readonly isModerator: boolean;
}

export interface AutomodJoinInput {
  readonly guildId: string;
  readonly userId: string;
  readonly occurredAt: Date;
  readonly isBot: boolean;
  readonly isModerator: boolean;
}

const MAX_MESSAGES_PER_USER = 101;
const MAX_TRACKED_USERS = 25_000;
const MAX_TRACKED_MESSAGES = 100_000;
const MAX_TRACKED_GUILDS = 1_000;
const MAX_JOIN_EVENTS_PER_GUILD = 100;
const invitePattern =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;

/** Bounded in-memory signals only; raw message text is never retained. */
export class AutomodEngine {
  private readonly messagesByActor = new Map<string, MessageEvent[]>();
  private readonly joinsByGuild = new Map<string, number[]>();
  private readonly messageHashKey = randomBytes(32);
  private trackedMessageCount = 0;

  public evaluateMessage(
    config: AutomodGuildConfig,
    input: AutomodMessageInput,
  ): readonly AutomodDetection[] {
    const at = input.occurredAt.getTime();
    if (
      input.isBot ||
      input.isModerator ||
      config.allowlistedUserIds.includes(input.userId) ||
      !Number.isFinite(at) ||
      !Number.isSafeInteger(input.mentionCount) ||
      input.mentionCount < 0
    ) {
      return [];
    }

    const contentHash = hashMessage(input.content, this.messageHashKey);
    const entry: MessageEvent = {
      at,
      contentHash,
      mentionCount: input.mentionCount,
      hasInvite: invitePattern.test(input.content),
    };
    const actorKey = `${input.guildId}:${input.userId}`;
    const maxWindow = Math.max(
      ...Object.entries(config.rules)
        .filter(([, rule]) => rule.enabled)
        .map(([, rule]) => rule.windowSeconds),
      1,
    );
    const previous = this.messagesByActor.get(actorKey) ?? [];
    const current = [
      ...previous.filter((event) => event.at <= at && event.at >= at - maxWindow * 1_000),
      entry,
    ].slice(-MAX_MESSAGES_PER_USER);
    const previousCount = previous.length;
    this.messagesByActor.delete(actorKey);
    this.messagesByActor.set(actorKey, current);
    this.trackedMessageCount += current.length - previousCount;
    while (
      this.messagesByActor.size > MAX_TRACKED_USERS ||
      this.trackedMessageCount > MAX_TRACKED_MESSAGES
    ) {
      const oldestActor = this.messagesByActor.keys().next().value;
      if (oldestActor === undefined) break;
      this.trackedMessageCount -= this.messagesByActor.get(oldestActor)?.length ?? 0;
      this.messagesByActor.delete(oldestActor);
    }

    const detections: AutomodDetection[] = [];
    for (const ruleKey of [
      'message_flood',
      'repeated_message',
      'mention_spam',
      'invite_advertising',
    ] as const) {
      const rule = config.rules[ruleKey];
      if (!rule.enabled) continue;
      const windowStart = at - rule.windowSeconds * 1_000;
      const recent = current.filter((event) => event.at >= windowStart);
      const previousEvents = recent.filter((event) => event !== entry);
      const observed = observedForRule(ruleKey, recent, contentHash);
      const previousObserved = observedForRule(ruleKey, previousEvents, contentHash);
      if (observed >= rule.threshold && previousObserved < rule.threshold) {
        detections.push({
          guildId: input.guildId,
          userId: input.userId,
          rule: ruleKey,
          observed,
          threshold: rule.threshold,
          escalation: rule.escalation,
          occurredAt: new Date(at),
        });
      }
    }
    return detections;
  }

  /** Join bursts are flagged for review only; this engine never bans members. */
  public evaluateJoin(
    config: AutomodGuildConfig,
    input: AutomodJoinInput,
  ): readonly AutomodDetection[] {
    const rule = config.rules.join_burst;
    const at = input.occurredAt.getTime();
    if (
      !rule.enabled ||
      input.isBot ||
      input.isModerator ||
      config.allowlistedUserIds.includes(input.userId) ||
      !Number.isFinite(at)
    ) {
      return [];
    }

    const previous = this.joinsByGuild.get(input.guildId) ?? [];
    const recent = previous.filter(
      (joinedAt) => joinedAt <= at && joinedAt >= at - rule.windowSeconds * 1_000,
    );
    const bounded = [...recent, at].slice(-MAX_JOIN_EVENTS_PER_GUILD);
    if (!this.joinsByGuild.has(input.guildId) && this.joinsByGuild.size >= MAX_TRACKED_GUILDS) {
      const oldestGuild = this.joinsByGuild.keys().next().value;
      if (oldestGuild !== undefined) this.joinsByGuild.delete(oldestGuild);
    }
    this.joinsByGuild.delete(input.guildId);
    this.joinsByGuild.set(input.guildId, bounded);
    if (recent.length >= rule.threshold || bounded.length < rule.threshold) return [];

    return [
      {
        guildId: input.guildId,
        userId: input.userId,
        rule: 'join_burst',
        observed: bounded.length,
        threshold: rule.threshold,
        escalation: rule.escalation,
        occurredAt: new Date(at),
      },
    ];
  }
}

function observedForRule(
  rule: Exclude<AutomodRuleKey, 'join_burst'>,
  recent: readonly MessageEvent[],
  contentHash: string,
): number {
  if (rule === 'message_flood') return recent.length;
  if (rule === 'repeated_message') {
    return recent.filter((event) => event.contentHash === contentHash).length;
  }
  if (rule === 'mention_spam') {
    return recent.reduce((total, event) => total + event.mentionCount, 0);
  }
  return recent.filter((event) => event.hasInvite).length;
}

function hashMessage(content: string, key: Buffer): string {
  const normalized = content.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  return createHmac('sha256', key).update(normalized).digest('hex');
}
