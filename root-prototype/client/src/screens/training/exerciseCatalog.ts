export type ExerciseId = "clap-rhythm" | "first-positions" | "port-de-bras";

export type ExerciseDefinition = {
  id: ExerciseId;
  title: string;
  focus: string;
  description: string;
  availability: "playable" | "preview";
  duration: string;
};

// Add future exercises here and register their player in TrainingScreen.
export const exerciseCatalog: ExerciseDefinition[] = [
  {
    id: "clap-rhythm",
    title: "Clap Rhythm",
    focus: "Rhythm & musicality",
    description: "Find a steady four-count and ask Madame to review it.",
    availability: "playable",
    duration: "A few moments",
  },
  {
    id: "first-positions",
    title: "First Positions",
    focus: "Foundations",
    description: "Place the five classical foot positions in order for Madame’s review.",
    availability: "playable",
    duration: "A few moments",
  },
  {
    id: "port-de-bras",
    title: "Port de Bras",
    focus: "Arms & expression",
    description: "Watch a short arm sequence, then reproduce it for Madame.",
    availability: "playable",
    duration: "A few moments",
  },
];
