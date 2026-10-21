import type {
  ChannelGuid,
  ChannelMessageCreateRequest,
  MessageGuid,
} from "@rootsdk/server-bot";
import { parseCommunityCommand } from "./communityCommandParser";
import { routeCommunityCommand } from "./communityCommandRouter";

export type CommunityHelpInput = Readonly<{
  communityId?: string;
  channelId: ChannelGuid;
  messageId: MessageGuid;
  messageContent: unknown;
  isUserMessage: boolean;
}>;

export function isHelpRequest(messageContent: unknown): boolean {
  const parsed = parseCommunityCommand(messageContent);
  return parsed.kind === "command" && parsed.command.name === "help";
}

export function createCommunityReply(
  event: CommunityHelpInput,
  communityId: string,
): ChannelMessageCreateRequest | undefined {
  if (!event || !event.isUserMessage) return undefined;
  if (!communityId || event.communityId !== communityId) return undefined;
  if (typeof event.channelId !== "string" || !event.channelId.trim()) return undefined;
  if (typeof event.messageId !== "string" || !event.messageId.trim()) return undefined;

  const parsed = parseCommunityCommand(event.messageContent);
  const response = routeCommunityCommand(parsed, String(event.messageId));
  if (!response || !response.message.trim()) return undefined;

  return {
    channelId: event.channelId,
    content: response.message,
    parentMessageIds: [event.messageId],
    needsParentMessageNotification: true,
  };
}

// Keep the original exported helper name for Root prototype consumers.
export const createCommunityHelpReply = createCommunityReply;
