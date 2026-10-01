import { ExpectedDomainError } from '../utils/expected-domain-error.js';

export type ModerationPermission =
  'manageMessages' | 'moderateMembers' | 'kickMembers' | 'banMembers';

export interface ModerationAuthorizationInput {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly guildOwnerId: string;
  readonly requiredPermission: ModerationPermission;
  readonly actorHasPermission: boolean;
  readonly botHasPermission: boolean;
  readonly targetMemberPresent: boolean;
  readonly requiresTargetMember: boolean;
  readonly actorHighestRolePosition: number;
  readonly targetHighestRolePosition: number;
  readonly botHighestRolePosition: number;
}

export type ModerationAuthorizationErrorCode =
  | 'permission_denied'
  | 'bot_permission_missing'
  | 'target_missing'
  | 'self_target'
  | 'owner_target'
  | 'actor_hierarchy'
  | 'bot_hierarchy'
  | 'hierarchy_unavailable';

export class ModerationAuthorizationError extends ExpectedDomainError {
  public constructor(
    public readonly code: ModerationAuthorizationErrorCode,
    userMessage: string,
  ) {
    super(`Moderation authorization rejected: ${code}.`, userMessage);
    this.name = 'ModerationAuthorizationError';
  }
}

/** Central fail-closed permission, membership, and role-hierarchy policy. */
export function assertModerationAuthorization(input: ModerationAuthorizationInput): void {
  if (input.actorUserId === input.targetUserId) {
    throw new ModerationAuthorizationError('self_target', 'You cannot moderate your own account.');
  }
  if (input.targetUserId === input.guildOwnerId) {
    throw new ModerationAuthorizationError(
      'owner_target',
      'The server owner cannot be targeted by this moderation command.',
    );
  }
  if (!input.actorHasPermission && input.actorUserId !== input.guildOwnerId) {
    throw new ModerationAuthorizationError(
      'permission_denied',
      `You need the ${input.requiredPermission} permission to use this command.`,
    );
  }
  if (!input.botHasPermission) {
    throw new ModerationAuthorizationError(
      'bot_permission_missing',
      `Noélia is missing the ${input.requiredPermission} permission.`,
    );
  }
  if (input.requiresTargetMember && !input.targetMemberPresent) {
    throw new ModerationAuthorizationError(
      'target_missing',
      'Choose a current member of this server.',
    );
  }
  if (
    !Number.isSafeInteger(input.actorHighestRolePosition) ||
    !Number.isSafeInteger(input.targetHighestRolePosition) ||
    !Number.isSafeInteger(input.botHighestRolePosition)
  ) {
    throw new ModerationAuthorizationError(
      'hierarchy_unavailable',
      'Noélia could not safely verify the role hierarchy. Try again once server data is available.',
    );
  }

  const actorIsOwner = input.actorUserId === input.guildOwnerId;
  if (!actorIsOwner && input.actorHighestRolePosition <= input.targetHighestRolePosition) {
    throw new ModerationAuthorizationError(
      'actor_hierarchy',
      'You can only moderate members below your highest role.',
    );
  }
  if (input.botHighestRolePosition <= input.targetHighestRolePosition) {
    throw new ModerationAuthorizationError(
      'bot_hierarchy',
      'Move Noélia’s highest role above the selected member before using this action.',
    );
  }
}
