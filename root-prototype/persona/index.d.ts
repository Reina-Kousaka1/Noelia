export type MadameMood =
  | "idle"
  | "greeting"
  | "explaining"
  | "approving"
  | "correcting"
  | "celebrating";

export type RootSection = "home" | "academy" | "training" | "wardrobe" | "profile";
export type ExerciseId = "clap-rhythm" | "first-positions" | "port-de-bras";
export type ExercisePhase = "explain" | "observe" | "begin" | "replay";
export type TrainingToneOutcome = "PERFECT" | "SUCCESS" | "SHAKY" | "FAIL";

export declare const moodLabels: Readonly<Record<MadameMood, string>>;
export declare const academyWelcome: Readonly<{ quote: string; note: string }>;
export declare function madameLine(mood: MadameMood, variationKey?: string): string;
export declare function sectionGreeting(section: RootSection): string;
export declare function exerciseGuidance(exerciseId: ExerciseId, phase: ExercisePhase): string;
export declare function trainingFeedback(outcome: TrainingToneOutcome, exerciseId: string): string;
export declare function wardrobeFeedback(appearanceId: string): string;
export declare function profileComment(uniformReady: boolean): string;
export declare function connectionFeedback(): string;
