export const AUTOMOD_RULE_KEYS = [
  'message_flood',
  'repeated_message',
  'mention_spam',
  'invite_advertising',
  'join_burst',
] as const;

export type AutomodRuleKey = (typeof AUTOMOD_RULE_KEYS)[number];
export type AutomodEscalation = 'OBSERVE' | 'CASE';

export interface AutomodRuleConfig {
  readonly enabled: boolean;
  readonly threshold: number;
  readonly windowSeconds: number;
  readonly escalation: AutomodEscalation;
}

export type AutomodRules = Readonly<Record<AutomodRuleKey, AutomodRuleConfig>>;

export interface AutomodGuildConfig {
  readonly guildId: string;
  readonly rules: AutomodRules;
  readonly allowlistedUserIds: readonly string[];
}

export interface AutomodDetection {
  readonly guildId: string;
  readonly userId: string;
  readonly rule: AutomodRuleKey;
  readonly observed: number;
  readonly threshold: number;
  readonly escalation: AutomodEscalation;
  readonly occurredAt: Date;
}

export interface AutomodConfigurationResult {
  readonly config: AutomodGuildConfig;
  readonly replayed: boolean;
}

export interface AutomodPort {
  getConfig(guildId: string): Promise<AutomodGuildConfig>;
  setRule(
    interactionId: string,
    guildId: string,
    actorUserId: string,
    rule: AutomodRuleKey,
    config: AutomodRuleConfig,
  ): Promise<AutomodConfigurationResult>;
  setAllowlisted(
    interactionId: string,
    guildId: string,
    actorUserId: string,
    userId: string,
    allowlisted: boolean,
  ): Promise<AutomodConfigurationResult>;
}

export const DEFAULT_AUTOMOD_RULES: AutomodRules = {
  message_flood: { enabled: false, threshold: 6, windowSeconds: 10, escalation: 'OBSERVE' },
  repeated_message: { enabled: false, threshold: 3, windowSeconds: 30, escalation: 'OBSERVE' },
  mention_spam: { enabled: false, threshold: 5, windowSeconds: 10, escalation: 'OBSERVE' },
  invite_advertising: { enabled: false, threshold: 1, windowSeconds: 60, escalation: 'OBSERVE' },
  join_burst: { enabled: false, threshold: 8, windowSeconds: 20, escalation: 'OBSERVE' },
};
