const assert = require("node:assert/strict");
const test = require("node:test");
const { isMadameBotMessage } = require("../dist/community-relay.js");

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
