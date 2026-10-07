import assert from "node:assert/strict";
import test from "node:test";
import { applyCommunityMadameEvent } from "../src/communityEvent.mjs";

test("the Root client presents a relayed Madame community event", () => {
  let presentation;
  applyCommunityMadameEvent(
    { message: "The Academy is ready.", mood: "explaining" },
    (mood, message) => { presentation = { mood, message }; },
  );

  assert.deepEqual(presentation, {
    mood: "explaining",
    message: "The Academy is ready.",
  });
});

test("unknown remote mood values fall back to a calm explanation", () => {
  let presentation;
  applyCommunityMadameEvent(
    { message: "A short update.", mood: "unexpected" },
    (mood, message) => { presentation = { mood, message }; },
  );

  assert.deepEqual(presentation, {
    mood: "explaining",
    message: "A short update.",
  });
});
