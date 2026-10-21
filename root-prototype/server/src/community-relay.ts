import {
  MadameCommunityContext,
  MadameCommunitySignal,
} from "@noelia-root/gen-shared";
import type { MadameCommunityEvent } from "@noelia-root/gen-shared";

export type RootCommunityMessage = Readonly<{
  communityId?: unknown;
  userId?: unknown;
  messageContent?: unknown;
}>;

export type MadameBotIdentity = Readonly<{
  communityId: string;
  botUserId: string;
}>;

const maximumRelayedMessageLength = 2_000;

export function isMadameBotMessage(
  event: RootCommunityMessage,
  identity: MadameBotIdentity,
): boolean {
  return typeof event === "object"
    && event !== null
    && identity.communityId.length > 0
    && identity.botUserId.length > 0
    && typeof event.communityId === "string"
    && typeof event.userId === "string"
    && event.communityId === identity.communityId
    && event.userId === identity.botUserId;
}

export function createMadameCommunityEvent(
  event: RootCommunityMessage,
  identity: MadameBotIdentity,
): MadameCommunityEvent | undefined {
  if (!isMadameBotMessage(event, identity)) return undefined;
  if (typeof event.messageContent !== "string") return undefined;

  const message = event.messageContent.trim();
  if (!message || message.length > maximumRelayedMessageLength) return undefined;

  return {
    message,
    mood: "explaining",
    context: MadameCommunityContext.COMMUNITY,
    signal: MadameCommunitySignal.COMMUNITY_REPLY,
  };
}
