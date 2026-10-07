const assert = require("node:assert/strict");
const test = require("node:test");
const { createDevhostEnvironment } = require("./devhost-config.cjs");

test("Root App requires its own environment credential without revealing values", () => {
  assert.throws(
    () => createDevhostEnvironment("app", {}),
    (error) => {
      assert.match(error.message, /NOELIA_ROOT_APP_DEV_TOKEN/);
      assert.doesNotMatch(error.message, /secret|token-value/i);
      return true;
    },
  );
});

test("Root Bot requires its own environment credential without revealing values", () => {
  assert.throws(
    () => createDevhostEnvironment("bot", {}),
    (error) => {
      assert.match(error.message, /NOELIA_ROOT_BOT_DEV_TOKEN/);
      assert.doesNotMatch(error.message, /secret|token-value/i);
      return true;
    },
  );
});

test("a generic DEV_TOKEN cannot silently substitute for the App-specific credential", () => {
  assert.throws(
    () => createDevhostEnvironment("app", { DEV_TOKEN: "not-a-credential" }),
    (error) => {
      assert.match(error.message, /NOELIA_ROOT_APP_DEV_TOKEN/);
      assert.doesNotMatch(error.message, /not-a-credential/);
      return true;
    },
  );
});

test("Root App and Bot receive only their selected credential as DEV_TOKEN", () => {
  // These are inert test sentinels, not valid Root credentials.
  const appEnvironment = createDevhostEnvironment("app", {
    NOELIA_ROOT_APP_DEV_TOKEN: "app-test-sentinel",
    NOELIA_ROOT_BOT_DEV_TOKEN: "bot-test-sentinel",
  });
  const botEnvironment = createDevhostEnvironment("bot", {
    NOELIA_ROOT_APP_DEV_TOKEN: "app-test-sentinel",
    NOELIA_ROOT_BOT_DEV_TOKEN: "bot-test-sentinel",
  });

  assert.equal(appEnvironment.DEV_TOKEN, "app-test-sentinel");
  assert.equal(botEnvironment.DEV_TOKEN, "bot-test-sentinel");
  assert.equal("NOELIA_ROOT_APP_DEV_TOKEN" in appEnvironment, false);
  assert.equal("NOELIA_ROOT_BOT_DEV_TOKEN" in appEnvironment, false);
  assert.equal("NOELIA_ROOT_APP_DEV_TOKEN" in botEnvironment, false);
  assert.equal("NOELIA_ROOT_BOT_DEV_TOKEN" in botEnvironment, false);
});
