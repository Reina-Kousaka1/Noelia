// Presentation only. Gameplay outcomes, eligibility, and rewards belong to their domains.
const lines = {
  idle: [
    "Everything has its place. We can begin when you are ready.",
    "A little composure makes the entire room feel more purposeful.",
  ],
  greeting: [
    "Welcome, ma chère. I trust you came prepared to make something lovely of today.",
    "Ah, there you are. We shall begin properly, of course.",
  ],
  explaining: [
    "Precisely. Attend to the detail first; the elegance will follow.",
    "A clear sequence makes even difficult work feel quite natural. Let us try it.",
  ],
  approving: [
    "Exactly so. That is the standard I had in mind.",
    "Much better. The movement now has intention.",
  ],
  correcting: [
    "That arrangement is a little uncoordinated. Again, please; you can refine it.",
    "Not quite. Let us restore the structure, one step at a time.",
  ],
  celebrating: [
    "Impeccable. Yes, that is much more like us.",
    "Voilà. A beautifully controlled result, as it should be.",
  ],
};

const moodLabels = {
  idle: "IN THE STUDIO",
  greeting: "A WORD FROM MADAME",
  explaining: "THE FINER POINTS",
  approving: "AS IT SHOULD BE",
  correcting: "A REFINEMENT, PLEASE",
  celebrating: "IMPECCABLY DONE",
};

const sections = {
  home: "Welcome, ma chère. I assume you have made room for a little excellent work today.",
  academy: "At my Academy, attention and grace are simply how we do things.",
  training: "Take your place. A deliberate beginning makes everything easier.",
  wardrobe: "A considered look is hardly extravagant. It is appropriate.",
  profile: "Your Academy record deserves a proper look. Let us see what it shows.",
};

const guidance = {
  "clap-rhythm": {
    explain: "Four even beats. Listen to the space between them; naturally, it matters.",
    begin: "Tap once for each beat. We need a purposeful rhythm, please.",
    replay: "Again, ma chère. This time, let each count land precisely.",
  },
  "first-positions": {
    explain: "We shall place all five positions in order. Structure first, always.",
    begin: "Begin with first position, then continue precisely through fifth.",
    replay: "Another attempt. The sequence will feel entirely natural soon.",
  },
  "port-de-bras": {
    explain: "Soft shoulders, long arms, and an unhurried breath. Naturally.",
    observe: "Watch the order closely. We begin low and finish where we began.",
    begin: "Now reproduce the arm sequence with the same quiet intention.",
    replay: "Again, ma chère. Let the arms travel with more purpose.",
  },
};

const training = {
  PERFECT: [
    "Impeccable. Precisely the standard I expected.",
    "Exactly so. Every detail found its place.",
  ],
  SUCCESS: [
    "Good. Much more appropriate. Keep that intention.",
    "A refined effort. There is still room to make it effortless.",
  ],
  SHAKY: [
    "Acceptable, though the timing is a little uncoordinated. Again, please.",
    "Some details wandered. Let us give the sequence a clearer shape.",
  ],
  FAIL: [
    "No. That arrangement simply will not do. Again, please.",
    "Not yet. The sequence needs more structure; let us work through it together.",
  ],
};

function select(options, key) {
  const index = [...key].reduce((sum, character) => sum + character.codePointAt(0), 0) % options.length;
  return options[index];
}

function madameLine(mood, variationKey = "default") {
  return select(lines[mood], variationKey);
}

function sectionGreeting(section) {
  return sections[section];
}

function exerciseGuidance(exerciseId, phase) {
  return guidance[exerciseId][phase];
}

function trainingFeedback(outcome, exerciseId) {
  return select(training[outcome], exerciseId);
}

function wardrobeFeedback(appearanceId) {
  return appearanceId === "ivory-matinée"
    ? "Impeccable. The ivory and satin make a most considered arrangement."
    : "The rose is refined for rehearsal. Precisely enough, without excess.";
}

function profileComment(uniformReady) {
  return uniformReady
    ? "Your uniform is in order. Naturally, the rest of the record deserves the same attention."
    : "The record is taking shape. An incomplete uniform is easily refined, ma chère.";
}

function connectionFeedback() {
  return "The studio connection has faltered. Your attempt is still here; please send it again.";
}

const academyWelcome = {
  quote: "Good technique is not a luxury. It is simply the foundation.",
  note: "Arrive prepared, listen closely, and let your work become impeccable in its own time.",
};

module.exports = {
  academyWelcome,
  madameLine,
  moodLabels,
  sectionGreeting,
  exerciseGuidance,
  trainingFeedback,
  wardrobeFeedback,
  profileComment,
  connectionFeedback,
};
