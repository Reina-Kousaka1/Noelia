export type RootCommunityMessage = Readonly<{
  communityId?: string;
  userId: string;
}>;

export type MadameBotIdentity = Readonly<{
  communityId: string;
  botUserId: string;
}>;

export function isMadameBotMessage(
  event: RootCommunityMessage,
  identity: MadameBotIdentity,
): boolean {
  return identity.communityId.length > 0
    && identity.botUserId.length > 0
    && event.communityId === identity.communityId
    && event.userId === identity.botUserId;
}
