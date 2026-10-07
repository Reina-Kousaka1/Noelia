import type {
  ChannelGuid,
  ChannelMessageCreateRequest,
  MessageGuid,
} from "@rootsdk/server-bot";
import { communityHelpResponse } from "@noelia-root/persona";

export type CommunityHelpInput = Readonly<{
  communityId?: string;
  channelId: ChannelGuid;
  messageId: MessageGuid;
  messageContent: string;
  isUserMessage: boolean;
}>;

export function isHelpRequest(messageContent: string): boolean {
  return /^!noelia\s+help\s*$/i.test(messageContent.trim());
}

export function createCommunityHelpReply(
  event: CommunityHelpInput,
  communityId: string,
): ChannelMessageCreateRequest | undefined {
  if (!event.isUserMessage) return undefined;
  if (event.communityId && event.communityId !== communityId) return undefined;
  if (!isHelpRequest(event.messageContent)) return undefined;

  const response = communityHelpResponse(event.messageId);
  if (isHelpRequest(response)) return undefined;

  return {
    channelId: event.channelId,
    content: response,
    parentMessageIds: [event.messageId],
    needsParentMessageNotification: true,
  };
}
