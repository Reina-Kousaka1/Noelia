import { describe, expect, it } from 'vitest';

import {
  createModerationCaseDraft,
  type CreateModerationCaseInput,
} from '../../src/moderation/case.js';

const baseInput: CreateModerationCaseInput = {
  idempotencyKey: '123456789012345678',
  guildId: '111111111111111111',
  actorUserId: '222222222222222222',
  targetUserId: '333333333333333333',
  action: 'warning',
  source: 'manual',
  occurredAt: new Date('2026-10-01T12:00:00.000Z'),
};

describe('createModerationCaseDraft', () => {
  it('normalizes optional reasons and copies input dates into the draft', () => {
    const occurredAt = new Date('2026-10-01T12:00:00.000Z');
    const input = { ...baseInput, occurredAt, reason: '  Please follow the rules.  ' };

    const draft = createModerationCaseDraft(input);
    occurredAt.setUTCFullYear(2030);

    expect(draft).toMatchObject({
      idempotencyKey: '123456789012345678',
      action: 'warning',
      source: 'manual',
      reason: 'Please follow the rules.',
    });
    expect(draft.occurredAt.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(draft.expiresAt).toBeNull();
  });

  it('requires timeouts to have a future expiry and copies that date', () => {
    const expiry = new Date('2026-10-01T13:00:00.000Z');
    const draft = createModerationCaseDraft({ ...baseInput, action: 'timeout', expiresAt: expiry });
    expiry.setUTCFullYear(2030);

    expect(draft.expiresAt?.toISOString()).toBe('2026-10-01T13:00:00.000Z');
  });

  it('rejects self-targeting cases', () => {
    expect(() =>
      createModerationCaseDraft({ ...baseInput, targetUserId: baseInput.actorUserId }),
    ).toThrowError(expect.objectContaining({ code: 'self_target' }));
  });

  it('rejects a timeout without an expiry or with an expiry in the past', () => {
    expect(() => createModerationCaseDraft({ ...baseInput, action: 'timeout' })).toThrowError(
      expect.objectContaining({ code: 'invalid_expiry' }),
    );
    expect(() =>
      createModerationCaseDraft({
        ...baseInput,
        action: 'timeout',
        expiresAt: new Date('2026-10-01T11:59:59.999Z'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_expiry' }));
  });

  it('rejects expiry dates on non-timeout cases and invalid reasons', () => {
    expect(() =>
      createModerationCaseDraft({ ...baseInput, expiresAt: new Date('2026-10-02T12:00:00.000Z') }),
    ).toThrowError(expect.objectContaining({ code: 'unexpected_expiry' }));
    expect(() =>
      createModerationCaseDraft({ ...baseInput, reason: 'x'.repeat(1_001) }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_reason' }));
  });

  it('rejects malformed Discord identities and idempotency keys', () => {
    expect(() => createModerationCaseDraft({ ...baseInput, guildId: 'not-a-snowflake' })).toThrow(
      'guildId must be a 17- to 20-digit numeric ID.',
    );
    expect(() => createModerationCaseDraft({ ...baseInput, idempotencyKey: 'bad key' })).toThrow(
      'Moderation idempotency key must be 1–128 safe identifier characters.',
    );
  });
});
