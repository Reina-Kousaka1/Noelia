const assert = require("node:assert/strict");
const test = require("node:test");
const { createMadameCommunityEvent, isMadameBotMessage } = require("../dist/community-relay.js");
const {
  MadameCommunityContext,
  MadameCommunityEvent,
  MadameCommunitySignal,
} = require("@noelia-root/gen-shared");

test("App relay accepts only the configured Bot identity in its own community", () => {
  const identity = { communityId: "community-test", botUserId: "bot-user-test" };
  assert.equal(isMadameBotMessage({ communityId: "community-test", userId: "bot-user-test" }, identity), true);
  assert.equal(isMadameBotMessage({ communityId: "other-community", userId: "bot-user-test" }, identity), false);
  assert.equal(isMadameBotMessage({ communityId: "community-test", userId: "member-test" }, identity), false);
  assert.equal(isMadameBotMessage({ userId: "bot-user-test" }, identity), false);
});

test("App relay stays disabled until both community and Bot identity are configured", () => {
  assert.equal(isMadameBotMessage(
    { communityId: "community-test", userId: "bot-user-test" },
    { communityId: "", botUserId: "bot-user-test" },
  ), false);
  assert.equal(isMadameBotMessage(
    { communityId: "community-test", userId: "bot-user-test" },
    { communityId: "community-test", botUserId: "" },
  ), false);
});

test("App relay creates a typed community event only for a bounded Bot reply", () => {
  const identity = { communityId: "community-test", botUserId: "bot-user-test" };
  const event = createMadameCommunityEvent({
    communityId: "community-test",
    userId: "bot-user-test",
    messageContent: "  Bonjour, ma chère.  ",
  }, identity);

  assert.deepEqual(event, {
    message: "Bonjour, ma chère.",
    mood: "explaining",
    context: MadameCommunityContext.COMMUNITY,
    signal: MadameCommunitySignal.COMMUNITY_REPLY,
  });
});

test("the generated broadcast contract round-trips mood, context, and signal", () => {
  const event = {
    message: "The barre is ready, ma chère.",
    mood: "explaining",
    context: MadameCommunityContext.BALLET,
    signal: MadameCommunitySignal.PREPARATION,
  };
  const decoded = MadameCommunityEvent.fromBinary(MadameCommunityEvent.toBinary(event));
  assert.deepEqual(decoded, event);
});

test("App relay safely rejects malformed or oversized community messages", () => {
  const identity = { communityId: "community-test", botUserId: "bot-user-test" };
  for (const messageContent of [undefined, null, {}, "", "  ", "x".repeat(2001)]) {
    assert.equal(createMadameCommunityEvent({
      communityId: "community-test",
      userId: "bot-user-test",
      messageContent,
    }, identity), undefined);
  }
  assert.equal(createMadameCommunityEvent(null, identity), undefined);
  assert.equal(createMadameCommunityEvent({
    communityId: "other-community",
    userId: "bot-user-test",
    messageContent: "A reply.",
  }, identity), undefined);
});
