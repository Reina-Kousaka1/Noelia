const assert = require("node:assert/strict");
const test = require("node:test");

const persona = require("./index.cjs");

const moods = ["idle", "greeting", "explaining", "approving", "correcting", "celebrating"];
const contexts = [
  "general",
  "home",
  "academy",
  "training",
  "wardrobe",
  "boutique",
  "profile",
  "community",
  "error",
];
const intensities = ["low", "medium", "high", "very-high"];
const keys = Array.from({ length: 64 }, (_, index) => `test-variation-${index}`);

test("the shared dialogue formatter covers every state, context, and intensity", () => {
  for (const mood of moods) {
    assert.ok(persona.moodLabels[mood]);
  }

  for (const context of contexts) {
    for (const state of moods) {
      for (const intensity of intensities) {
        const line = persona.dialogueLine({
          context,
          state,
          intensity,
          variationKey: "coverage",
        });
        assert.equal(typeof line, "string");
        assert.ok(line.trim().length > 0, `${context}/${state}/${intensity} should have a fallback`);
      }
    }
  }
});

test("the same variation key is stable and different keys provide curated alternatives", () => {
  for (const mood of moods) {
    const request = {
      context: "general",
      state: mood,
      intensity: "low",
      variationKey: "same-request",
    };
    assert.equal(persona.dialogueLine(request), persona.dialogueLine(request));

    const variants = new Set(keys.map((variationKey) =>
      persona.dialogueLine({ ...request, variationKey }),
    ));
    assert.ok(variants.size > 1, `${mood} should have more than one curated line`);
  }
});

test("existing persona helpers remain usable and delegate to contextual dialogue", () => {
  for (const section of ["home", "academy", "training", "wardrobe", "profile", "boutique", "community"]) {
    assert.ok(persona.sectionGreeting(section, "visit-1"));
  }
  for (const exercise of ["clap-rhythm", "first-positions", "port-de-bras"]) {
    for (const phase of ["explain", "begin", "replay"]) {
      assert.ok(persona.exerciseGuidance(exercise, phase));
    }
  }
  assert.ok(persona.exerciseGuidance("port-de-bras", "observe"));
  assert.ok(persona.academyWelcome.quote);
  assert.ok(persona.academyWelcome.note);
  assert.ok(persona.wardrobeFeedback("rose-rehearsal", "preview-1"));
  assert.ok(persona.wardrobeFeedback("ivory-matinée", "preview-2"));
  assert.ok(persona.profileComment(true, "profile-1"));
  assert.ok(persona.profileComment(false, "profile-2"));
  assert.ok(persona.connectionFeedback("request-1"));

  assert.equal(
    persona.madameLine("greeting", "visit-1", "academy", "medium"),
    persona.dialogueLine({
      context: "academy",
      state: "greeting",
      intensity: "medium",
      variationKey: "visit-1",
    }),
  );
});

test("training reactions stay presentation-only, stable per request, and vary across attempts", () => {
  for (const outcome of ["PERFECT", "SUCCESS", "SHAKY", "FAIL"]) {
    const sameRequest = persona.trainingFeedback(outcome, "clap-rhythm", "attempt-1");
    assert.equal(sameRequest, persona.trainingFeedback(outcome, "clap-rhythm", "attempt-1"));
    assert.ok(sameRequest.length > 0);

    const variants = new Set(keys.map((variationKey) =>
      persona.trainingFeedback(outcome, "clap-rhythm", variationKey),
    ));
    assert.ok(variants.size > 1, `${outcome} should offer more than one reaction`);
  }

  const perfect = keys.map((variationKey) =>
    persona.trainingFeedback("PERFECT", "clap-rhythm", variationKey),
  );
  assert.ok(perfect.some((line) => /genuinely|magnificent|impressive/i.test(line)));

  const corrections = keys.map((variationKey) =>
    persona.trainingFeedback("FAIL", "clap-rhythm", variationKey),
  );
  assert.ok(corrections.every((line) => /again|reset|begin|slow|breath/i.test(line)));
});

test("feature contexts express their own tone without changing Madame's states", () => {
  const wardrobe = keys.map((variationKey) => persona.dialogueLine({
    context: "wardrobe",
    state: "approving",
    intensity: "high",
    variationKey,
  }));
  assert.ok(wardrobe.some((line) => /refined|impeccable|sophisticated|ordinary/i.test(line)));

  const community = keys.map((variationKey) => persona.dialogueLine({
    context: "community",
    state: "approving",
    intensity: "high",
    variationKey,
  }));
  assert.ok(community.some((line) => /competitive|attention|coordination/i.test(line)));

  const academy = persona.dialogueLine({
    context: "academy",
    state: "explaining",
    intensity: "medium",
    variationKey: "academy-stage",
  });
  assert.match(academy, /stage|Academy|requirement/i);
});

test("contextual corrections criticize the work and offer a useful next action", () => {
  for (const context of ["general", "academy", "training", "wardrobe", "community"]) {
    const corrections = keys.map((variationKey) =>
      persona.dialogueLine({
        context,
        state: "correcting",
        intensity: context === "community" ? "medium" : "high",
        variationKey,
      }),
    );
    assert.ok(
      corrections.every((line) => /again|reset|begin|try|address|shall we|choose|take a breath|step|complete/i.test(line)),
      `${context} corrections should guide the next action`,
    );
    assert.ok(corrections.every((line) => !/you are (?:bad|stupid|ordinary|ineffective)/i.test(line)));
  }
});

test("error dialogue remains calm and helpful regardless of requested intensity", () => {
  const messages = keys.flatMap((variationKey) => [
    persona.dialogueLine({
      context: "error",
      state: "correcting",
      intensity: "very-high",
      variationKey,
    }),
    persona.dialogueLine({
      context: "error",
      state: "celebrating",
      intensity: "high",
      variationKey,
    }),
  ]);
  assert.ok(messages.every((line) => /please|try|send|connection|read/i.test(line)));
  assert.ok(messages.every((line) => !/impeccable|ordinary|will not do/i.test(line)));
});

test("curated dialogue stays non-self-aware, non-cruel, and focused on work rather than people", () => {
  const allLines = [];
  for (const context of contexts) {
    for (const state of moods) {
      for (const intensity of intensities) {
        for (const variationKey of keys) {
          allLines.push(persona.dialogueLine({ context, state, intensity, variationKey }));
        }
      }
    }
  }

  const corpus = allLines.join(" ");
  assert.doesNotMatch(corpus, /I am (?:rich|spoiled|arrogant|the queen|better than everyone)/i);
  assert.doesNotMatch(corpus, /you are (?:bad|stupid|ordinary|poor|worthless)/i);
  assert.doesNotMatch(corpus, /(?:poor people|people who cannot afford|your weight|you are fat)/i);
});

test("invalid inputs receive a safe neutral fallback", () => {
  assert.equal(
    persona.dialogueLine({ context: "unknown", state: "unknown", intensity: "unknown" }),
    persona.dialogueLine({ context: "general", state: "idle", intensity: "low" }),
  );
  assert.ok(persona.exerciseGuidance("unknown", "unknown"));
  assert.ok(persona.trainingFeedback("UNKNOWN", "unknown", "key"));
});
