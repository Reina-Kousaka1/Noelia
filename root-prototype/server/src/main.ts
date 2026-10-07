import {
  ChannelMessageEvent,
  ChannelMessageCreatedEvent,
  rootServer,
  RootAppStartState,
} from "@rootsdk/server-app";
import { academyTrainingService } from "./academyTrainingService";
import { isMadameBotMessage } from "./community-relay";
import { madameCommunityService } from "./madameCommunityService";

function configuredBotUserId(): string | undefined {
  const botUserId = process.env.NOELIA_ROOT_BOT_USER_ID?.trim();
  return botUserId || undefined;
}

let botMessageListener: ((event: ChannelMessageCreatedEvent) => void) | undefined;

async function onStarting(state: RootAppStartState) {
  rootServer.lifecycle.addService(academyTrainingService);
  rootServer.lifecycle.addService(madameCommunityService);
  const botUserId = configuredBotUserId();
  if (!botUserId) return;

  botMessageListener = (event) => {
    if (!event.communityId) return;
    if (!isMadameBotMessage(event, { communityId: state.communityId, botUserId })) return;

    madameCommunityService.broadcastMadameEvent({
      message: event.messageContent,
      mood: "explaining",
    });
  };
  rootServer.community.channelMessages.on(
    ChannelMessageEvent.ChannelMessageCreated,
    botMessageListener,
  );
}

async function onStopping(): Promise<void> {
  if (!botMessageListener) return;
  rootServer.community.channelMessages.off(
    ChannelMessageEvent.ChannelMessageCreated,
    botMessageListener,
  );
  botMessageListener = undefined;
}

(async () => {
  await rootServer.lifecycle.start(onStarting, onStopping);
})();
