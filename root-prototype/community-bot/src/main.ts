import {
  ChannelMessageEvent,
  MessageType,
  RootBotStartState,
  rootServer,
} from "@rootsdk/server-bot";
import { createCommunityReply } from "./communityHelp";

async function onStarting(state: RootBotStartState): Promise<void> {
  rootServer.community.channelMessages.on(
    ChannelMessageEvent.ChannelMessageCreated,
    (event) => {
      try {
        const reply = createCommunityReply({
          communityId: event.communityId ? String(event.communityId) : undefined,
          channelId: event.channelId,
          messageId: event.id,
          messageContent: event.messageContent,
          isUserMessage: event.messageType === MessageType.UserMessage,
        }, String(state.communityId));
        if (!reply) return;

        void Promise.resolve(rootServer.community.channelMessages.create(reply)).catch(() => {
          console.error("Root Community Bot could not send a channel reply.");
        });
      } catch {
        console.error("Root Community Bot could not process a channel message.");
      }
    },
  );
}

void rootServer.lifecycle.start(onStarting);
