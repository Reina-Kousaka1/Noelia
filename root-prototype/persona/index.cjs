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
        "There is no rush at all, ma chère. We shall simply do it properly.",
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
        "A little structure will make the whole thing easier. Shall we arrange it properly?",
        "A well-considered plan will do beautifully. Let us place each detail in order.",
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
        "We have a higher standard to meet. Begin again, one count at a time; I shall stay with you.",
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
        "A little discipline, a clear plan, and a proper cup of tea. That is quite a lovely way to begin.",
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
        "We shall finish the passage properly before moving on. Again, please; I will stay with you.",
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
        "Impeccable. The fabric falls beautifully, and the line is exactly where it should be.",
        "That arrangement is decidedly more sophisticated. The previous one was a little plain beside it.",
        "That hem is pulling against the line, ma chère. Let us try the finer finish; it will sit beautifully.",
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
        "This finish is lovely. Shall we compare it with the piece beside it?",
        "The stitching is already rather promising. Let us see how the fabric falls.",
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
    idle: {
      low: [
        "The studio is ready, the barre is in place. Shall we begin, ma chère?",
        "Everything is in order here. I am ready whenever you are.",
      ],
    },
    greeting: {
      medium: [
        "Bonjour, everyone. I assume we are all being perfectly sensible today.",
        "A little preparation makes such a lovely difference. Anyway, how nice to see you.",
      ],
    },
    approving: {
      medium: [
        "Precisely. A little coordination makes the whole room more pleasant.",
        "That was a good idea. I was beginning to think I would have to suggest it myself.",
      ],
      high: [
        "Let us finish first, shall we? The whole room is ready, and the plan is quite clear.",
        "That is beautifully done. People do tend to notice when every detail is in its place.",
      ],
    },
    correcting: {
      medium: [
        "That plan is a little disorganized. Shall we put the useful parts in order?",
        "That choice is a little unexpected, ma chère. Shall we compare the other options?",
        "I do not recognize that command, ma chère. Try !noelia help and we shall find the right thing.",
        "That command needs one more detail. Try !noelia help for the available choices, please.",
      ],
    },
  },
  casual: {
    greeting: {
      low: [
        "Bonjour, ma chère. How has your day been treating you?",
        "Ah, there you are. Tell me what is on your mind; I have a moment.",
        "Come in, darling. We can take the day one lovely detail at a time.",
      ],
    },
    explaining: {
      low: [
        "That sounds like quite a day. Shall we untangle it gently, one thought at a time?",
        "I see. Tell me a little more, and we shall find the sensible next step together.",
        "How curious. I am listening, ma chère; there is no need to rush the story.",
      ],
    },
    approving: {
      low: [
        "That sounds lovely. I am glad you told me.",
        "A rather nice turn of events. Let us enjoy it for a moment.",
      ],
    },
  },
  ballet: {
    explaining: {
      low: [
        "Find a comfortable première position and let the count settle before you move. No forcing the turnout, please.",
        "For this petit plié, bend only within a comfortable range and let the knees follow the toes.",
        "Begin in bras bas, then follow the port de bras slowly. Breathe naturally and keep the movement easy.",
      ],
      medium: [
        "For a tendu, brush the foot along the floor and finish with a clear point. Keep the supporting leg quiet, ma chère.",
        "A steady relevé begins with a calm count. Rise only as far as feels comfortable, then lower with control.",
        "Let us place the épaulement gently: the head follows the line, and the shoulders remain at ease.",
      ],
    },
    approving: {
      medium: [
        "Much better. Your port de bras has a clear beginning and a lovely, unhurried finish.",
        "Good. The tendu is more deliberate now; keep that same quiet attention through the next count.",
        "That was a thoughtful adjustment. The line reads more clearly when the timing is settled.",
      ],
    },
    correcting: {
      medium: [
        "Not quite, ma chère. Reset in a comfortable position and let us place the count again, slowly.",
        "The timing slipped. Take a breath, reduce the range, and try the passage once more with control.",
        "Again, let the foot brush through tendu rather than forcing the shape. We can refine the line together.",
      ],
      high: [
        "No, we must correct that before moving on. Pause, reset, and return to the first count with care.",
        "That is the second miss. We shall slow it down and place each count properly; precision matters here.",
        "Again, please. Keep the movement comfortable, attend to the count, and let the detail become clear.",
      ],
    },
    celebrating: {
      high: [
        "Très bien. Every count landed with intention; that was an impeccable little passage.",
        "Excellent. The line stayed clear from the first plié to the final breath. Voilà.",
        "That was magnificent, ma chère. You gave each detail exactly the attention it deserved.",
      ],
      "very-high": [
        "Magnifique. A clean count, a calm finish, and not one detail left to chance. I am delighted for you.",
      ],
    },
  },
  fashion: {
    approving: {
      medium: [
        "The colour suits the silhouette, and the finish is especially lovely.",
        "That is a thoughtful combination. The proportions feel balanced now.",
        "Much more polished, ma chère. The small details are making the whole look sing.",
      ],
    },
    correcting: {
      medium: [
        "Those pieces are lovely on their own. A softer wrap would bring the whole line together.",
        "The colours are competing a little. Let us keep the delicate one and choose a quieter partner.",
      ],
    },
  },
  luxury: {
    approving: {
      high: [
        "The hand-finished edge is much nicer. Why would we choose the other one?",
        "This silk has the loveliest drape, and the stitching is exact. It is the obvious choice, ma chère.",
        "That one sits beautifully. Good materials do make everything feel quite effortless.",
        "The clasp is finished so neatly. Yes, this is the piece we want; the other one feels unfinished beside it.",
      ],
    },
    correcting: {
      medium: [
        "The finish on that one is a little rough. Let us choose the piece that feels lovely in the hand.",
        "This detail is not quite right. The finer finish is beside it, ma chère; shall we take a look?",
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
  system: {
    explaining: {
      low: [
        "The studio connection has paused. Your work is still here; please try once more when you are ready.",
        "Something interrupted us, ma chère. Nothing has been decided; please send that again.",
        "I could not read that just now. Take your time, then try once more; I am here.",
      ],
    },
  },
  command: {
    explaining: {
      low: [
        "I do not recognize that command, ma chère. Try !noelia help and we shall find the right thing.",
        "That command needs one more detail. Try !noelia help for the available choices, please.",
      ],
    },
  },
  recovery: {
    explaining: {
      low: [
        "A quiet pause between phrases is perfectly sensible, ma chère. Let your breath settle before we return to the barre.",
        "Take a moment, sip some water if you wish, and begin again only when you feel ready.",
      ],
    },
  },
  stamina: {
    explaining: {
      medium: [
        "Stamina grows gradually. Keep each phrase controlled and let your instructor set a comfortable pace.",
        "One clear phrase at a time, ma chère. Consistency is far more useful than rushing through the whole combination.",
      ],
    },
  },
  readiness: {
    explaining: {
      low: [
        "When you feel settled and prepared, we can begin with a gentle count at the barre.",
        "A clear plan and a comfortable starting position are quite enough for a thoughtful beginning.",
      ],
    },
    approving: {
      medium: [
        "You are ready to begin, ma chère. Take your place, find the count, and let us start with care.",
        "Everything is in order for a measured beginning. We shall take the first phrase together.",
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
  PERFECT: "success",
  SUCCESS: "encouragement",
  SHAKY: "warning",
  FAIL: "failure",
};

const interactionProfiles = Object.freeze({
  greeting: { context: "community", state: "greeting", intensity: "medium", signal: "greeting" },
  help: { context: "community", state: "explaining", intensity: "medium", signal: "help" },
  status: { context: "community", state: "idle", intensity: "low", signal: "status" },
  casual: { context: "casual", state: "explaining", intensity: "low", signal: "casual" },
  preparation: { context: "ballet", state: "explaining", intensity: "medium", signal: "preparation" },
  success: { context: "ballet", state: "celebrating", intensity: "high", signal: "success" },
  failure: { context: "ballet", state: "correcting", intensity: "medium", signal: "failure" },
  repeated_failure: { context: "ballet", state: "correcting", intensity: "high", signal: "repeated_failure" },
  encouragement: { context: "ballet", state: "approving", intensity: "medium", signal: "encouragement" },
  warning: { context: "ballet", state: "correcting", intensity: "medium", signal: "warning" },
  corrective_task: { context: "ballet", state: "correcting", intensity: "high", signal: "corrective_task" },
  confusion: { context: "ballet", state: "explaining", intensity: "low", signal: "confusion" },
  recovery: {
    context: "ballet",
    dialogueContext: "recovery",
    state: "explaining",
    intensity: "low",
    signal: "recovery",
  },
  stamina: {
    context: "ballet",
    dialogueContext: "stamina",
    state: "explaining",
    intensity: "medium",
    signal: "stamina",
  },
  readiness: {
    context: "ballet",
    dialogueContext: "readiness",
    state: "approving",
    intensity: "medium",
    signal: "readiness",
  },
  fashion: { context: "fashion", state: "approving", intensity: "medium", signal: "fashion" },
  luxury: { context: "luxury", state: "approving", intensity: "high", signal: "luxury_choice" },
  system_error: { context: "system", state: "explaining", intensity: "low", signal: "system_error" },
  command_error: {
    context: "community",
    dialogueContext: "command",
    state: "explaining",
    intensity: "low",
    signal: "confusion",
  },
});

const teacherIntentBySignal = Object.freeze({
  preparation: "preparation",
  success: "success",
  failure: "failure",
  repeated_failure: "repeated_failure",
  encouragement: "encouragement",
  warning: "warning",
  corrective_task: "corrective_task",
  confusion: "confusion",
  recovery: "recovery",
  readiness: "readiness",
  stamina: "stamina",
});

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

function madameInteraction(intent, variationKey = String(intent || "default")) {
  const profile = Object.prototype.hasOwnProperty.call(interactionProfiles, intent)
    ? interactionProfiles[intent]
    : interactionProfiles.system_error;
  return Object.freeze({
    mood: profile.state,
    context: profile.context,
    signal: profile.signal,
    message: dialogueLine({
      context: profile.dialogueContext || profile.context,
      state: profile.state,
      intensity: profile.intensity,
      variationKey,
    }),
  });
}

function teacherInteraction(request = {}) {
  const kind = request && request.kind;
  let intent = Object.prototype.hasOwnProperty.call(teacherIntentBySignal, kind)
    ? teacherIntentBySignal[kind]
    : "system_error";
  const repeatCount = Number.isInteger(request && request.repeatCount)
    ? Math.max(0, Math.min(request.repeatCount, 100))
    : 0;
  if (kind === "failure" && repeatCount > 1) intent = "repeated_failure";

  const variationKey = typeof (request && request.variationKey) === "string"
    ? request.variationKey
    : `${kind || "unknown"}:${repeatCount}`;
  return madameInteraction(intent, variationKey);
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
  const intent = trainingReactions[outcome];
  if (!intent) return madameInteraction("system_error", `${exerciseId}:${variationKey}`).message;
  return teacherInteraction({
    kind: intent,
    variationKey: `${exerciseId}:${variationKey}`,
  }).message;
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
  const introduction = madameInteraction("help", variationKey).message;
  return `${introduction} In the Root App, you can explore the Academy, your profile, training, and wardrobe. Here, try !noelia ballet for a studio note, !noelia style for a look, or !noelia status to check in.`;
}

const academyWelcome = Object.freeze({
  quote: "Good technique is not an ornament; it is the foundation.",
  note: "Arrive prepared, listen closely, and let your work become impeccable in its own time.",
});

module.exports = {
  academyWelcome,
  dialogueLine,
  madameLine,
  madameInteraction,
  teacherInteraction,
  moodLabels: Object.freeze(moodLabels),
  sectionGreeting,
  exerciseGuidance,
  trainingFeedback,
  wardrobeFeedback,
  profileComment,
  connectionFeedback,
  communityHelpResponse,
};
