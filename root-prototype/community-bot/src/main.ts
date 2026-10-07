import {
  ChannelMessageEvent,
  MessageType,
  RootBotStartState,
  rootServer,
} from "@rootsdk/server-bot";
import { createCommunityHelpReply } from "./communityHelp";

async function onStarting(state: RootBotStartState): Promise<void> {
  rootServer.community.channelMessages.on(
    ChannelMessageEvent.ChannelMessageCreated,
    (event) => {
      const reply = createCommunityHelpReply({
        communityId: event.communityId ? String(event.communityId) : undefined,
        channelId: event.channelId,
        messageId: event.id,
        messageContent: event.messageContent,
        isUserMessage: event.messageType === MessageType.UserMessage,
      }, String(state.communityId));
      if (!reply) return;

      void rootServer.community.channelMessages.create(reply).catch(() => {
        console.error("Root Community Bot could not send its help reply.");
      });
    },
  );
}

void rootServer.lifecycle.start(onStarting);
