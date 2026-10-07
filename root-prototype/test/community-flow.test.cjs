const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createCommunityHelpReply } = require("../community-bot/dist/communityHelp.js");
const { isMadameBotMessage } = require("../server/dist/community-relay.js");
const { applyCommunityMadameEvent } = require("../client/src/communityEvent.mjs");

test("Root Bot -> shared Madame -> Root App client works within one community", async () => {
  const communityId = "community-test";
  const botUserId = "bot-user-test";
  const botReply = createCommunityHelpReply({
    communityId,
    channelId: "channel-test",
    messageId: "request-message-test",
    messageContent: "!noelia help",
    isUserMessage: true,
  }, communityId);

  assert.ok(botReply);
  assert.ok(botReply.content.length > 0);
  assert.deepEqual(botReply.parentMessageIds, ["request-message-test"]);

  const incomingBotMessage = {
    communityId,
    channelId: botReply.channelId,
    userId: botUserId,
    id: "bot-reply-test",
    messageContent: botReply.content,
  };
  const broadcast = new EventEmitter();
  let clientPresentation;
  broadcast.on("broadcastCreated", (event) => {
    applyCommunityMadameEvent(event, (mood, message) => {
      clientPresentation = { mood, message };
    });
  });

  if (isMadameBotMessage(incomingBotMessage, { communityId, botUserId })) {
    broadcast.emit("broadcastCreated", {
      message: incomingBotMessage.messageContent,
      mood: "explaining",
    });
  }

  assert.deepEqual(clientPresentation, {
    mood: "explaining",
    message: botReply.content,
  });
});
