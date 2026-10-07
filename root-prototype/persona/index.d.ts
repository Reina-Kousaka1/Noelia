export type MadameMood =
  | "idle"
  | "greeting"
  | "explaining"
  | "approving"
  | "correcting"
  | "celebrating";

export type DialogueContext =
  | "general"
  | "home"
  | "academy"
  | "training"
  | "wardrobe"
  | "boutique"
  | "profile"
  | "community"
  | "error";
export type DialogueIntensity = "low" | "medium" | "high" | "very-high";
export type DialogueRequest = Readonly<{
  context: DialogueContext;
  state: MadameMood;
  intensity?: DialogueIntensity;
  variationKey?: string;
}>;

export type RootSection =
  | "home"
  | "academy"
  | "training"
  | "wardrobe"
  | "profile"
  | "boutique"
  | "community";
export type ExerciseId = "clap-rhythm" | "first-positions" | "port-de-bras";
export type ExercisePhase = "explain" | "observe" | "begin" | "replay";
export type TrainingToneOutcome = "PERFECT" | "SUCCESS" | "SHAKY" | "FAIL";

export declare const moodLabels: Readonly<Record<MadameMood, string>>;
export declare const academyWelcome: Readonly<{ quote: string; note: string }>;
export declare function dialogueLine(request: DialogueRequest): string;
export declare function madameLine(
  mood: MadameMood,
  variationKey?: string,
  context?: DialogueContext,
  intensity?: DialogueIntensity,
): string;
export declare function sectionGreeting(section: RootSection, variationKey?: string): string;
export declare function exerciseGuidance(
  exerciseId: ExerciseId,
  phase: ExercisePhase,
  variationKey?: string,
): string;
export declare function trainingFeedback(
  outcome: TrainingToneOutcome,
  exerciseId: string,
  variationKey?: string,
): string;
export declare function wardrobeFeedback(appearanceId: string, variationKey?: string): string;
export declare function profileComment(uniformReady: boolean, variationKey?: string): string;
export declare function connectionFeedback(variationKey?: string): string;
