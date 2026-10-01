import { describe, expect, it } from 'vitest';

import { AutomodEngine } from '../../src/automod/engine.js';
import { DEFAULT_AUTOMOD_RULES } from '../../src/automod/types.js';
import type {
  AutomodGuildConfig,
  AutomodRuleConfig,
  AutomodRuleKey,
} from '../../src/automod/types.js';

const guildId = '111111111111111111';
const userId = '222222222222222222';
const startAt = new Date('2026-10-01T12:00:00.000Z');

function config(
  enabledRules: Partial<Record<AutomodRuleKey, Partial<AutomodRuleConfig>>>,
  allowlistedUserIds: readonly string[] = [],
): AutomodGuildConfig {
  const rules = { ...DEFAULT_AUTOMOD_RULES };
  for (const [key, value] of Object.entries(enabledRules) as [
    AutomodRuleKey,
    Partial<AutomodRuleConfig>,
  ][]) {
    rules[key] = { ...rules[key], ...value };
  }
  return { guildId, rules, allowlistedUserIds };
}

function message(
  occurredAt: Date,
  overrides: Partial<{
    readonly content: string;
    readonly mentionCount: number;
    readonly isBot: boolean;
    readonly isModerator: boolean;
    readonly userId: string;
  }> = {},
) {
  return {
    guildId,
    userId,
    content: 'Let us keep dancing',
    mentionCount: 0,
    occurredAt,
    isBot: false,
    isModerator: false,
    ...overrides,
  };
}

describe('AutoMod event engine', () => {
  it('flags flood and repeated-message thresholds once when they are crossed', () => {
    const engine = new AutomodEngine();
    const rules = config({
      message_flood: { enabled: true, threshold: 3, windowSeconds: 10, escalation: 'CASE' },
      repeated_message: { enabled: true, threshold: 3, windowSeconds: 30, escalation: 'OBSERVE' },
    });

    expect(engine.evaluateMessage(rules, message(startAt, { content: 'same line' }))).toEqual([]);
    expect(
      engine.evaluateMessage(
        rules,
        message(new Date(startAt.getTime() + 1_000), { content: 'SAME   LINE' }),
      ),
    ).toEqual([]);
    expect(
      engine.evaluateMessage(
        rules,
        message(new Date(startAt.getTime() + 2_000), { content: 'same line' }),
      ),
    ).toEqual([
      expect.objectContaining({ rule: 'message_flood', observed: 3, escalation: 'CASE' }),
      expect.objectContaining({ rule: 'repeated_message', observed: 3, escalation: 'OBSERVE' }),
    ]);
    expect(
      engine.evaluateMessage(
        rules,
        message(new Date(startAt.getTime() + 3_000), { content: 'same line' }),
      ),
    ).toEqual([]);
  });

  it('catches mention threshold jumps and invite links without returning raw content', () => {
    const engine = new AutomodEngine();
    const rules = config({
      mention_spam: { enabled: true, threshold: 5, windowSeconds: 10 },
      invite_advertising: { enabled: true, threshold: 1, windowSeconds: 60 },
    });
    const result = engine.evaluateMessage(
      rules,
      message(startAt, {
        content: 'Join https://discord.gg/example',
        mentionCount: 6,
      }),
    );

    expect(result.map((detection) => detection.rule)).toEqual([
      'mention_spam',
      'invite_advertising',
    ]);
    expect(JSON.stringify(result)).not.toContain('discord.gg/example');
  });

  it('bypasses bots, moderators, and allowlisted users', () => {
    const engine = new AutomodEngine();
    const rules = config({ message_flood: { enabled: true, threshold: 1 } }, [userId]);

    expect(engine.evaluateMessage(rules, message(startAt))).toEqual([]);
    expect(
      engine.evaluateMessage(rules, message(startAt, { userId: '333333333333333333' })),
    ).toHaveLength(1);
    expect(
      engine.evaluateMessage(
        rules,
        message(new Date(startAt.getTime() + 1_000), { isBot: true, userId: '444444444444444444' }),
      ),
    ).toEqual([]);
    expect(
      engine.evaluateMessage(
        rules,
        message(new Date(startAt.getTime() + 2_000), {
          isModerator: true,
          userId: '555555555555555555',
        }),
      ),
    ).toEqual([]);
  });

  it('detects a join burst for moderator review without any automatic ban action', () => {
    const engine = new AutomodEngine();
    const rules = config({
      join_burst: { enabled: true, threshold: 3, windowSeconds: 20, escalation: 'CASE' },
    });
    const join = (user: string, seconds: number) =>
      engine.evaluateJoin(rules, {
        guildId,
        userId: user,
        occurredAt: new Date(startAt.getTime() + seconds * 1_000),
        isBot: false,
        isModerator: false,
      });

    expect(join('222222222222222222', 0)).toEqual([]);
    expect(join('333333333333333333', 1)).toEqual([]);
    expect(join('444444444444444444', 2)).toEqual([
      expect.objectContaining({ rule: 'join_burst', observed: 3, escalation: 'CASE' }),
    ]);
    expect(join('555555555555555555', 3)).toEqual([]);
  });

  it('does not retrigger maximum-threshold alerts while bounded history is full', () => {
    const messageEngine = new AutomodEngine();
    const messageRules = config({
      message_flood: { enabled: true, threshold: 100, windowSeconds: 60 },
    });
    let floodDetections = 0;
    for (let index = 0; index <= 100; index += 1) {
      floodDetections += messageEngine.evaluateMessage(
        messageRules,
        message(new Date(startAt.getTime() + index), { content: `message ${index}` }),
      ).length;
    }
    expect(floodDetections).toBe(1);

    const joinEngine = new AutomodEngine();
    const joinRules = config({
      join_burst: { enabled: true, threshold: 100, windowSeconds: 60, escalation: 'CASE' },
    });
    let joinDetections = 0;
    for (let index = 0; index <= 100; index += 1) {
      joinDetections += joinEngine.evaluateJoin(joinRules, {
        guildId,
        userId: `user-${index}`,
        occurredAt: new Date(startAt.getTime() + index),
        isBot: false,
        isModerator: false,
      }).length;
    }
    expect(joinDetections).toBe(1);
  });
});
