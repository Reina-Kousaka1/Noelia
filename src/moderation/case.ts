import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';

export const MODERATION_ACTIONS = ['note', 'warning', 'timeout', 'kick', 'ban'] as const;
export const MODERATION_SOURCES = ['manual', 'automod', 'system'] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];
export type ModerationSource = (typeof MODERATION_SOURCES)[number];
export type ModerationPolicyErrorCode =
  'self_target' | 'invalid_reason' | 'invalid_occurred_at' | 'invalid_expiry' | 'unexpected_expiry';

export interface CreateModerationCaseInput {
  readonly idempotencyKey: string;
  readonly guildId: string;
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly action: ModerationAction;
  readonly source: ModerationSource;
  readonly reason?: string | null;
  readonly occurredAt: Date;
  readonly expiresAt?: Date | null;
}

/** A validated, transport-independent moderation record ready for persistence. */
export interface ModerationCaseDraft {
  readonly idempotencyKey: string;
  readonly guildId: string;
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly action: ModerationAction;
  readonly source: ModerationSource;
  readonly reason: string | null;
  readonly occurredAt: Date;
  readonly expiresAt: Date | null;
}

export class ModerationPolicyError extends Error {
  public constructor(
    public readonly code: ModerationPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ModerationPolicyError';
  }
}

const MAX_REASON_LENGTH = 1_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:._-]{1,128}$/;

export function createModerationCaseDraft(input: CreateModerationCaseInput): ModerationCaseDraft {
  if (!(MODERATION_ACTIONS as readonly string[]).includes(input.action)) {
    throw new TypeError('Unsupported moderation action.');
  }
  if (!(MODERATION_SOURCES as readonly string[]).includes(input.source)) {
    throw new TypeError('Unsupported moderation source.');
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
    throw new TypeError('Moderation idempotency key must be 1–128 safe identifier characters.');
  }

  assertDiscordSnowflake(input.guildId, 'guildId');
  assertDiscordSnowflake(input.actorUserId, 'actorUserId');
  assertDiscordSnowflake(input.targetUserId, 'targetUserId');

  if (input.actorUserId === input.targetUserId) {
    throw new ModerationPolicyError('self_target', 'A moderator cannot target their own account.');
  }

  const reason = input.reason?.trim() || null;
  if (reason !== null && reason.length > MAX_REASON_LENGTH) {
    throw new ModerationPolicyError(
      'invalid_reason',
      `Moderation reason must not exceed ${MAX_REASON_LENGTH} characters.`,
    );
  }

  const occurredAt = new Date(input.occurredAt.getTime());
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new ModerationPolicyError('invalid_occurred_at', 'Moderation occurredAt must be valid.');
  }

  const inputExpiry = input.expiresAt ?? null;
  let expiresAt: Date | null = null;
  if (input.action === 'timeout') {
    if (inputExpiry === null || !Number.isFinite(inputExpiry.getTime())) {
      throw new ModerationPolicyError('invalid_expiry', 'A timeout requires a valid expiry time.');
    }
    if (inputExpiry.getTime() <= occurredAt.getTime()) {
      throw new ModerationPolicyError('invalid_expiry', 'Timeout expiry must be after its start.');
    }
    expiresAt = new Date(inputExpiry.getTime());
  } else if (inputExpiry !== null) {
    throw new ModerationPolicyError(
      'unexpected_expiry',
      'Only timeout cases may have an expiry time.',
    );
  }

  return {
    idempotencyKey: input.idempotencyKey,
    guildId: input.guildId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    action: input.action,
    source: input.source,
    reason,
    occurredAt,
    expiresAt,
  };
}
