import { describe, expect, it } from 'vitest';

import {
  assertModerationAuthorization,
  ModerationAuthorizationError,
} from '../../src/moderation/authorization.js';
import type { ModerationAuthorizationInput } from '../../src/moderation/authorization.js';

const permittedInput: ModerationAuthorizationInput = {
  actorUserId: '111111111111111111',
  targetUserId: '222222222222222222',
  guildOwnerId: '333333333333333333',
  requiredPermission: 'kickMembers',
  actorHasPermission: true,
  botHasPermission: true,
  targetMemberPresent: true,
  requiresTargetMember: true,
  actorHighestRolePosition: 10,
  targetHighestRolePosition: 1,
  botHighestRolePosition: 20,
};

describe('moderation authorization', () => {
  it('allows a permitted actor when both actor and bot outrank the target', () => {
    expect(() => assertModerationAuthorization(permittedInput)).not.toThrow();
  });

  it('fails closed for missing permissions, missing members, and unavailable hierarchy', () => {
    const cases: readonly [Partial<ModerationAuthorizationInput>, string][] = [
      [{ actorHasPermission: false }, 'permission_denied'],
      [{ botHasPermission: false }, 'bot_permission_missing'],
      [{ targetMemberPresent: false }, 'target_missing'],
      [{ actorHighestRolePosition: Number.NaN }, 'hierarchy_unavailable'],
    ];

    for (const [override, code] of cases) {
      try {
        assertModerationAuthorization({ ...permittedInput, ...override });
        throw new Error(`Expected ${code} to be denied.`);
      } catch (error) {
        expect(error).toBeInstanceOf(ModerationAuthorizationError);
        expect(error).toMatchObject({ code });
      }
    }
  });

  it('prevents self-targeting, owner-targeting, and role-hierarchy escalation', () => {
    const cases: readonly [Partial<ModerationAuthorizationInput>, string][] = [
      [{ targetUserId: permittedInput.actorUserId }, 'self_target'],
      [{ targetUserId: permittedInput.guildOwnerId }, 'owner_target'],
      [{ actorHighestRolePosition: 1 }, 'actor_hierarchy'],
      [{ botHighestRolePosition: 1 }, 'bot_hierarchy'],
    ];

    for (const [override, code] of cases) {
      try {
        assertModerationAuthorization({ ...permittedInput, ...override });
        throw new Error(`Expected ${code} to be denied.`);
      } catch (error) {
        expect(error).toBeInstanceOf(ModerationAuthorizationError);
        expect(error).toMatchObject({ code });
      }
    }
  });

  it('lets the server owner bypass only their own role comparison', () => {
    expect(() =>
      assertModerationAuthorization({
        ...permittedInput,
        actorUserId: permittedInput.guildOwnerId,
        actorHasPermission: false,
        actorHighestRolePosition: 0,
      }),
    ).not.toThrow();
  });
});
