import assert from "node:assert/strict";
import test from "node:test";
import { applyCommunityMadameEvent } from "../src/communityEvent.mjs";

test("the Root client presents a relayed Madame community event", () => {
  let presentation;
  const applied = applyCommunityMadameEvent(
    { message: "The Academy is ready.", mood: "explaining", context: 2, signal: 19 },
    (mood, message) => { presentation = { mood, message }; },
  );

  assert.equal(applied, true);
  assert.deepEqual(presentation, {
    mood: "explaining",
    message: "The Academy is ready.",
  });
});

test("unknown remote mood values fall back to a calm explanation", () => {
  let presentation;
  const applied = applyCommunityMadameEvent(
    { message: "A short update.", mood: "unexpected" },
    (mood, message) => { presentation = { mood, message }; },
  );

  assert.equal(applied, true);
  assert.deepEqual(presentation, {
    mood: "explaining",
    message: "A short update.",
  });
});

test("malformed or oversized broadcasts are ignored without updating Madame", () => {
  let updates = 0;
  for (const event of [
    null,
    {},
    { message: "   ", mood: "greeting" },
    { message: "x".repeat(2001), mood: "explaining" },
  ]) {
    assert.equal(applyCommunityMadameEvent(event, () => { updates += 1; }), false);
  }
  assert.equal(updates, 0);
});
