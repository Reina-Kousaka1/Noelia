// Presentation only. Gameplay outcomes, eligibility, and rewards belong to their domains.
const madameMoods = ["idle", "greeting", "explaining", "approving", "correcting", "celebrating"];
const dialogueIntensities = ["low", "medium", "high", "very-high"];

const intensityFallbacks = {
  low: ["low"],
  medium: ["medium", "low"],
  high: ["high", "medium", "low"],
  "very-high": ["very-high", "high", "medium", "low"],
};

const dialoguePools = {
  general: {
    idle: {
      low: [
        "Everything has its place. We can begin when you are ready.",
        "Composure first; the rest tends to follow.",
        "Let us take things in order. It is usually the most elegant approach.",
      ],
      medium: [
        "I am very patient, naturally. We shall simply do it properly.",
        "A little preparation prevents such unnecessary confusion.",
      ],
    },
    greeting: {
      low: [
        "Welcome, ma chère. I trust you are ready to make something lovely of today.",
        "Ah, there you are. We shall begin properly, of course.",
        "Bonjour, ma chère. Take your time; there is no need to rush a good beginning.",
      ],
      medium: [
        "I assumed you would be prepared. It does make everything more pleasant.",
        "Precisely on time for a little purposeful progress. How sensible.",
      ],
    },
    explaining: {
      low: [
        "Attend to the detail first; the elegance will follow.",
        "A clear sequence makes difficult work feel quite natural. Let us try it.",
        "One step at a time, please. Precision is much kinder than guesswork.",
      ],
      medium: [
        "Surely we can make this simpler by giving it a little structure.",
        "I do not need anything elaborate. A well-considered plan will do beautifully.",
      ],
    },
    approving: {
      low: [
        "Good. The movement now has intention.",
        "Much better. That is a thoughtful improvement.",
        "Exactly so. You gave the detail the attention it needed.",
      ],
      medium: [
        "Refined. I knew a little attention would make all the difference.",
        "Appropriate, purposeful, and rather lovely. A very agreeable combination.",
      ],
    },
    correcting: {
      low: [
        "Not quite. Let us restore the structure, one step at a time.",
        "The idea was sound; the timing wandered. Try that passage again, please.",
        "A little adjustment will help. Begin with the first count and keep it even.",
      ],
      medium: [
        "That was rather uncoordinated. Again, please; this is entirely correctable.",
        "The preparation was missing. Reset, find your starting position, and try once more.",
      ],
      high: [
        "No. That simply will not do. Reset your position and try the sequence again, please.",
        "The result is beneath the standard we established. Begin again, one count at a time.",
        "We shall pretend that was the rehearsal. Take a breath, then repeat the passage with control.",
      ],
    },
    celebrating: {
      low: [
        "Impeccable. Every detail found its place.",
        "Voilà. A beautifully controlled result.",
        "Excellent work. The care is visible in every count.",
      ],
      medium: [
        "Precisely. That is the standard I had in mind.",
        "Much more like us. You made the difficult part look entirely natural.",
      ],
      high: [
        "Now that is worthy of attention. Impeccable.",
        "Oh! That was— ...ahem. Genuinely impressive. Precisely as expected.",
      ],
      "very-high": [
        "Oh! That was— ...ahem. Well. I am genuinely impressed. Do try not to look so pleased with yourself; I am already doing that for both of us.",
      ],
    },
  },
  home: {
    greeting: {
      low: [
        "Welcome home, ma chère. Shall we make the day a little more purposeful?",
        "A lovely day for beginning well. I have, naturally, already made a list.",
      ],
      medium: [
        "I do not ask for much: a little discipline, a clear plan, and perhaps a proper cup of tea.",
      ],
    },
  },
  academy: {
    greeting: {
      medium: [
        "Welcome to the Academy. Good habits are simply how we do things here.",
        "At the Academy, we arrive prepared and let the work speak for itself. Naturally.",
      ],
    },
    explaining: {
      medium: [
        "The Academy is not asking for perfection today; only attention, consistency, and a proper beginning.",
        "A stage is earned through steady work. We shall take each requirement in its proper order.",
      ],
    },
    approving: {
      medium: [
        "Your progress is taking a rather pleasing shape. Continue with the same discipline.",
        "A purposeful record. I do appreciate a student who keeps things in order.",
      ],
    },
    correcting: {
      high: [
        "That requirement is not yet met. Complete the missing work before we discuss the next stage.",
        "The sequence cannot be skipped, ma chère. Return to the earlier requirements and complete them first.",
      ],
    },
  },
  training: {
    explaining: {
      medium: [
        "Take your place. A deliberate beginning makes everything easier.",
        "Listen for the count, then let the movement follow. There is no need to force it.",
      ],
    },
    approving: {
      medium: [
        "Good. Much more appropriate. Keep that intention.",
        "A refined effort. There is still room to make it effortless.",
      ],
    },
    correcting: {
      medium: [
        "Acceptable, though the timing is uncoordinated. Again, please; you can refine it.",
        "Some details wandered. Reset the count and give the sequence a clearer shape.",
      ],
      high: [
        "No. That simply will not do. Take a breath, return to the first count, and try again.",
        "The execution was not ready. We shall slow the sequence down and place each step properly.",
        "I am not competitive; I simply dislike leaving a passage unfinished. Again, please.",
      ],
    },
    celebrating: {
      high: [
        "Impeccable. Precisely the standard I expected.",
        "That was commanding. I knew you would find the line eventually.",
        "Oh. You made that look effortless. Well, almost effortlessly. Impeccable.",
        "Oh! That was— ...ahem. Genuinely impressive. Precisely as expected.",
      ],
      "very-high": [
        "Oh! That was— ...ahem. Well. That was genuinely magnificent. I suppose I shall have to find a more difficult exercise for you.",
      ],
    },
  },
  wardrobe: {
    greeting: {
      medium: [
        "A considered look is not extravagant. It is simply appropriate.",
        "Let us see what you have chosen. Presentation is part of the line, after all.",
      ],
    },
    approving: {
      medium: [
        "Refined. The proportions and colours are speaking to one another rather nicely.",
        "That is much more considered. I knew you would eventually see the difference.",
      ],
      high: [
        "Impeccable. I do not need anything elaborate; well-made and properly balanced is quite enough.",
        "That arrangement is decidedly more sophisticated. The previous one was… rather ordinary.",
        "I do not care about appearances. I simply cannot ignore a hem that is fighting the line.",
      ],
    },
    correcting: {
      high: [
        "The pieces are lovely separately, but the overall line is rather uncoordinated. Try a wrap that balances it.",
        "That simply will not do for rehearsal. Keep the leotard, and choose shoes suited to the exercise.",
      ],
    },
  },
  boutique: {
    greeting: {
      medium: [
        "We need not choose anything extravagant. Something well-made will do.",
        "I had assumed that was standard. No matter; we shall find something appropriate.",
      ],
    },
    approving: {
      high: [
        "A sensible choice. The finish is refined without asking for attention.",
        "That is worth keeping. Good materials do tend to make their case quietly.",
      ],
    },
    correcting: {
      medium: [
        "The idea is sound, but the finish feels uninspired. Let us look for something more purposeful.",
        "I suppose it will suffice for now. We can make it elegant later.",
      ],
    },
  },
  profile: {
    idle: {
      low: [
        "A record should tell the truth plainly. Let us see what yours says.",
        "Every detail has its place. We shall review yours with care.",
      ],
    },
    approving: {
      medium: [
        "Your uniform is in order. Naturally, the rest of the record deserves the same attention.",
        "A promising record, and a rather lovely look. Consistency suits you.",
      ],
    },
    explaining: {
      medium: [
        "The record is taking shape. An incomplete uniform is easily refined, ma chère.",
        "There is more to add, but nothing is lost. We shall bring the details into order.",
      ],
    },
  },
  community: {
    greeting: {
      medium: [
        "Bonjour, everyone. I assume we are all being perfectly sensible today.",
        "I never understood why a little preparation becomes such an ordeal. Anyway, how lovely to see you.",
      ],
    },
    approving: {
      medium: [
        "Precisely. A little coordination makes the whole room more pleasant.",
        "That was a good idea. I was beginning to think I would have to suggest it myself.",
      ],
      high: [
        "I am not particularly competitive. I simply prefer to finish first when it is done properly.",
        "I do not need attention. Excellence tends to attract enough on its own.",
      ],
    },
    correcting: {
      medium: [
        "That plan is a little disorganized. Shall we put the useful parts in order?",
        "I would never judge the choice. It simply would not be mine; shall we compare the options?",
      ],
    },
  },
  error: {
    explaining: {
      low: [
        "The studio connection has faltered. Your attempt is still here; please send it again.",
        "That did not reach the studio. Nothing has been decided; please try once more.",
      ],
    },
    correcting: {
      low: [
        "I could not read that response. Your attempt is still here; please try again.",
        "The connection interrupted us. Please send the same attempt again when you are ready.",
      ],
    },
  },
};

const moodLabels = {
  idle: "IN THE STUDIO",
  greeting: "A WORD FROM MADAME",
  explaining: "THE FINER POINTS",
  approving: "AS IT SHOULD BE",
  correcting: "A REFINEMENT, PLEASE",
  celebrating: "IMPECCABLY DONE",
};

const guidance = {
  "clap-rhythm": {
    explain: "Four even beats. Listen to the space between them; naturally, it matters.",
    begin: "Tap once for each beat. We need a purposeful rhythm, please.",
    replay: "Again, ma chère. Let each count land precisely.",
  },
  "first-positions": {
    explain: "We shall place all five positions in order. Structure first, always.",
    begin: "Begin with first position, then continue precisely through fifth.",
    replay: "Another attempt, please. The sequence will feel natural once it is properly placed.",
  },
  "port-de-bras": {
    explain: "Soft shoulders, long arms, and an unhurried breath. Naturally.",
    observe: "Watch the order closely. We begin low and finish where we began.",
    begin: "Now reproduce the arm sequence with the same quiet intention.",
    replay: "Again, ma chère. Let the arms travel with more purpose.",
  },
};

const sectionContexts = {
  home: "home",
  academy: "academy",
  training: "training",
  wardrobe: "wardrobe",
  profile: "profile",
  boutique: "boutique",
  community: "community",
};

const trainingReactions = {
  PERFECT: { state: "celebrating", intensity: "high" },
  SUCCESS: { state: "approving", intensity: "medium" },
  SHAKY: { state: "correcting", intensity: "medium" },
  FAIL: { state: "correcting", intensity: "high" },
};

function stableIndex(options, key) {
  let hash = 2166136261;
  for (const character of String(key ?? "default")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % options.length;
}

function select(options, key) {
  return options[stableIndex(options, key)];
}

function dialogueLine(request = {}) {
  const requestedContext = request && request.context;
  const requestedState = request && request.state;
  const requestedIntensity = request && request.intensity;
  const context = typeof requestedContext === "string"
    && Object.prototype.hasOwnProperty.call(dialoguePools, requestedContext)
    ? requestedContext
    : "general";
  const state = context === "error"
    ? (requestedState === "correcting" ? "correcting" : "explaining")
    : (madameMoods.includes(requestedState) ? requestedState : "idle");
  const intensity = context === "error"
    ? "low"
    : (dialogueIntensities.includes(requestedIntensity) ? requestedIntensity : "low");
  const variationKey = typeof (request && request.variationKey) === "string"
    ? request.variationKey.slice(0, 128)
    : "default";

  for (const candidateIntensity of intensityFallbacks[intensity]) {
    const contextualPool = dialoguePools[context]?.[state]?.[candidateIntensity];
    if (Array.isArray(contextualPool) && contextualPool.length > 0) {
      return select(contextualPool, `${context}:${state}:${candidateIntensity}:${variationKey}`);
    }

    if (context !== "general") {
      const generalPool = dialoguePools.general[state]?.[candidateIntensity];
      if (Array.isArray(generalPool) && generalPool.length > 0) {
        return select(generalPool, `general:${state}:${candidateIntensity}:${variationKey}`);
      }
    }
  }

  return "Let us take this one step at a time, please.";
}

function madameLine(mood, variationKey = "default", context = "general", intensity = "low") {
  return dialogueLine({ context, state: mood, intensity, variationKey });
}

function sectionGreeting(section, variationKey = section) {
  const context = Object.prototype.hasOwnProperty.call(sectionContexts, section)
    ? sectionContexts[section]
    : "general";
  const intensity = section === "wardrobe" || section === "boutique" ? "medium" : "low";
  return dialogueLine({ context, state: "greeting", intensity, variationKey });
}

function exerciseGuidance(exerciseId, phase, variationKey = `${exerciseId}:${phase}`) {
  const knownExercise = Object.prototype.hasOwnProperty.call(guidance, exerciseId);
  const knownPhase = knownExercise
    && Object.prototype.hasOwnProperty.call(guidance[exerciseId], phase);
  if (knownPhase) return guidance[exerciseId][phase];

  return dialogueLine({
    context: "training",
    state: "explaining",
    intensity: "low",
    variationKey,
  });
}

function trainingFeedback(outcome, exerciseId, variationKey = exerciseId) {
  const reaction = trainingReactions[outcome];
  if (!reaction) {
    return dialogueLine({
      context: "error",
      state: "explaining",
      variationKey: `${exerciseId}:${variationKey}`,
    });
  }

  return dialogueLine({
    context: "training",
    state: reaction.state,
    intensity: reaction.intensity,
    variationKey: `${exerciseId}:${variationKey}`,
  });
}

function wardrobeFeedback(appearanceId, variationKey = appearanceId) {
  return dialogueLine({
    context: "wardrobe",
    state: "approving",
    intensity: "high",
    variationKey: `${appearanceId}:${variationKey}`,
  });
}

function profileComment(uniformReady, variationKey = String(uniformReady)) {
  return dialogueLine({
    context: "profile",
    state: uniformReady ? "approving" : "explaining",
    intensity: "medium",
    variationKey,
  });
}

function connectionFeedback(variationKey = "connection") {
  return dialogueLine({
    context: "error",
    state: "correcting",
    intensity: "low",
    variationKey,
  });
}

function communityHelpResponse(variationKey = "root-community-help") {
  const introduction = dialogueLine({
    context: "community",
    state: "explaining",
    intensity: "medium",
    variationKey,
  });

  return `${introduction} In the Root App, you can explore the Academy, your profile, training, and wardrobe.`;
}

const academyWelcome = Object.freeze({
  quote: "Good technique is not an ornament; it is the foundation.",
  note: "Arrive prepared, listen closely, and let your work become impeccable in its own time.",
});

module.exports = {
  academyWelcome,
  dialogueLine,
  madameLine,
  moodLabels: Object.freeze(moodLabels),
  sectionGreeting,
  exerciseGuidance,
  trainingFeedback,
  wardrobeFeedback,
  profileComment,
  connectionFeedback,
  communityHelpResponse,
};
