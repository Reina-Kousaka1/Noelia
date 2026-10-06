const assert = require("node:assert/strict");
const test = require("node:test");

const persona = require("./index.cjs");

test("every Madame state has a label and deterministic, varied guidance", () => {
  for (const mood of ["idle", "greeting", "explaining", "approving", "correcting", "celebrating"]) {
    assert.ok(persona.moodLabels[mood]);
    assert.equal(persona.madameLine(mood, "0"), persona.madameLine(mood, "0"));
    assert.notEqual(persona.madameLine(mood, "0"), persona.madameLine(mood, "1"));
  }
});

test("all Root sections and training exercises use the shared voice", () => {
  for (const section of ["home", "academy", "training", "wardrobe", "profile"]) {
    assert.ok(persona.sectionGreeting(section));
  }
  for (const exercise of ["clap-rhythm", "first-positions", "port-de-bras"]) {
    for (const phase of ["explain", "begin", "replay"]) {
      assert.ok(persona.exerciseGuidance(exercise, phase));
    }
  }
  assert.ok(persona.exerciseGuidance("port-de-bras", "observe"));
  assert.ok(persona.academyWelcome.quote);
  assert.ok(persona.academyWelcome.note);
  assert.ok(persona.wardrobeFeedback("rose-rehearsal"));
  assert.ok(persona.wardrobeFeedback("ivory-matinée"));
  assert.ok(persona.profileComment(true));
  assert.ok(persona.profileComment(false));
  assert.ok(persona.connectionFeedback());
});

test("training reactions vary by exercise without changing outcomes or attacking the dancer", () => {
  for (const outcome of ["PERFECT", "SUCCESS", "SHAKY", "FAIL"]) {
    const line = persona.trainingFeedback(outcome, "clap-rhythm");
    assert.equal(line, persona.trainingFeedback(outcome, "clap-rhythm"));
    assert.ok(line.length > 0);
    assert.doesNotMatch(line, /you are (bad|stupid|ordinary|ineffective)/i);
    assert.notEqual(line, persona.trainingFeedback(outcome, "port-de-bras"));
  }
});

test("the voice does not declare wealth or superiority", () => {
  const lines = [
    ...Object.keys(persona.moodLabels).map((mood) => persona.madameLine(mood)),
    ...["home", "academy", "training", "wardrobe", "profile"].map(persona.sectionGreeting),
    ...["PERFECT", "SUCCESS", "SHAKY", "FAIL"].map((outcome) =>
      persona.trainingFeedback(outcome, "clap-rhythm"),
    ),
  ];
  assert.doesNotMatch(lines.join(" "), /I am (rich|better than everyone|the queen|spoiled)/i);
});
