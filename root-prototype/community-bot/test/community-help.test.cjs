const assert = require("node:assert/strict");
const test = require("node:test");
const { createCommunityHelpReply, createCommunityReply, isHelpRequest } = require("../dist/communityHelp.js");
const { parseCommunityCommand } = require("../dist/communityCommandParser.js");
const { routeCommunityCommand } = require("../dist/communityCommandRouter.js");

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
  assert.match(reply.content, /!noelia ballet/);
  assert.equal(createCommunityHelpReply(message(), "community-test").content, reply.content);
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
    message({ communityId: undefined }),
    "community-test",
  ), undefined);
  assert.equal(createCommunityHelpReply(
    message({ isUserMessage: false }),
    "community-test",
  ), undefined);
});

test("the community command router supports only small stateless Madame interactions", () => {
  const commands = [
    ["!noelia status", /studio is ready|everything is in order/i],
    ["!noelia hello", /bonjour|welcome|there you are/i],
    ["!noelia chat", /day|listening|curious/i],
    ["!noelia ballet", /plié|port de bras|tendu|relevé|épaulement/i],
    ["!noelia ballet success", /impeccable|excellent|beautifully controlled/i],
    ["!noelia ballet again", /again|reset|second miss|correct/i],
    ["!noelia style", /colour|polished|proportions|finish/i],
    ["!noelia luxury", /finish|stitching|silk|materials|clasp/i],
  ];

  for (const [messageContent, expected] of commands) {
    const reply = createCommunityReply(message({ messageContent }), "community-test");
    assert.ok(reply, `${messageContent} should produce a reply`);
    assert.match(reply.content, expected, messageContent);
    assert.equal(reply.channelId, "channel-test");
    assert.deepEqual(reply.parentMessageIds, ["message-test"]);
  }

  const parsed = parseCommunityCommand("!noelia ballet again");
  assert.equal(parsed.kind, "command");
  const first = routeCommunityCommand(parsed, "same-request");
  assert.equal(first.message, routeCommunityCommand(parsed, "same-request").message);
  const variations = new Set(Array.from({ length: 64 }, (_, index) =>
    routeCommunityCommand(parsed, `ballet-${index}`).message,
  ));
  assert.ok(variations.size > 1);
});

test("unknown and malformed commands receive safe Madame guidance", () => {
  const unknown = createCommunityReply(message({ messageContent: "!noelia economy" }), "community-test");
  assert.ok(unknown);
  assert.match(unknown.content, /do not recognize|try !noelia help/i);
  assert.doesNotMatch(unknown.content, /bank|cash|transfer|balance/i);

  for (const messageContent of ["!noelia", "!noelia help extra", "!noelia ballet one two", `!noelia ${"x".repeat(300)}`]) {
    const malformed = createCommunityReply(message({ messageContent }), "community-test");
    assert.ok(malformed, `${messageContent.slice(0, 40)} should be handled`);
    assert.match(malformed.content, /please|try|send|connection/i);
  }

  const invalidInput = parseCommunityCommand(null);
  assert.deepEqual(invalidInput, { kind: "malformed", reason: "invalid_input" });
  assert.equal(createCommunityReply(message({ messageContent: null }), "community-test").content.length > 0, true);
});

test("the command parser ignores unrelated messages and bounds command data", () => {
  assert.deepEqual(parseCommunityCommand("good morning"), { kind: "ignore" });
  assert.deepEqual(parseCommunityCommand("!noeliax help"), { kind: "ignore" });
  assert.deepEqual(parseCommunityCommand("!noelia"), { kind: "malformed", reason: "missing_command" });
  assert.deepEqual(parseCommunityCommand(`!noelia ${"x".repeat(300)}`), { kind: "malformed", reason: "too_long" });
  assert.deepEqual(parseCommunityCommand("!noelia fake"), { kind: "unknown", command: "fake" });
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
