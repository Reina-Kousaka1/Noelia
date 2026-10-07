const assert = require("node:assert/strict");
const test = require("node:test");
const { createCommunityHelpReply, isHelpRequest } = require("../dist/communityHelp.js");

function message(overrides = {}) {
  return {
    communityId: "community-test",
    channelId: "channel-test",
    messageId: "message-test",
    messageContent: "!noelia help",
    isUserMessage: true,
    ...overrides,
  };
}

test("the community help trigger is narrow and case-insensitive", () => {
  assert.equal(isHelpRequest("!Noelia HELP"), true);
  assert.equal(isHelpRequest("!noelia help extra"), false);
  assert.equal(isHelpRequest("!noelia training"), false);
});

test("Root Bot replies through the shared Madame persona in the same channel", async () => {
  const reply = createCommunityHelpReply(message(), "community-test");

  assert.ok(reply);
  assert.equal(reply.channelId, "channel-test");
  assert.deepEqual(reply.parentMessageIds, ["message-test"]);
  assert.match(reply.content, /Academy|Root App/i);
});

test("Root Bot only replies to the help trigger, preventing reply loops", async () => {
  assert.equal(createCommunityHelpReply(
    message({ messageContent: "Bonjour, everyone. In the Root App, explore the Academy." }),
    "community-test",
  ), undefined);
  assert.equal(createCommunityHelpReply(
    message({ communityId: "other-community" }),
    "community-test",
  ), undefined);
  assert.equal(createCommunityHelpReply(
    message({ isUserMessage: false }),
    "community-test",
  ), undefined);
});

test("Root Bot ignores system messages and non-help messages", async () => {
  assert.equal(createCommunityHelpReply(
    message({ isUserMessage: false }),
    "community-test",
  ), undefined);
  assert.equal(createCommunityHelpReply(
    message({ messageContent: "good morning" }),
    "community-test",
  ), undefined);
});
