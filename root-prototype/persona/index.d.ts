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
  | "casual"
  | "ballet"
  | "fashion"
  | "luxury"
  | "system"
  | "command"
  | "recovery"
  | "stamina"
  | "readiness"
  | "error";
export type DialogueIntensity = "low" | "medium" | "high" | "very-high";
export type MadameInteractionIntent =
  | "greeting"
  | "help"
  | "status"
  | "casual"
  | "preparation"
  | "success"
  | "failure"
  | "repeated_failure"
  | "encouragement"
  | "warning"
  | "corrective_task"
  | "confusion"
  | "recovery"
  | "stamina"
  | "readiness"
  | "fashion"
  | "luxury"
  | "command_error"
  | "system_error";
export type BalletTeacherSignal =
  | "preparation"
  | "success"
  | "failure"
  | "repeated_failure"
  | "encouragement"
  | "warning"
  | "corrective_task"
  | "confusion"
  | "recovery"
  | "readiness"
  | "stamina";
export type MadameEventContext = "community" | "ballet" | "fashion" | "luxury" | "system";
export type MadameSignal =
  | "greeting"
  | "help"
  | "status"
  | "casual"
  | "preparation"
  | "success"
  | "failure"
  | "repeated_failure"
  | "encouragement"
  | "warning"
  | "corrective_task"
  | "confusion"
  | "recovery"
  | "stamina"
  | "readiness"
  | "fashion"
  | "luxury_choice"
  | "system_error"
  | "community_reply";
export type MadameInteraction = Readonly<{
  mood: MadameMood;
  context: MadameEventContext;
  signal: MadameSignal;
  message: string;
}>;
export type BalletTeacherRequest = Readonly<{
  kind: BalletTeacherSignal;
  repeatCount?: number;
  variationKey?: string;
}>;
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
export declare function madameInteraction(
  intent: MadameInteractionIntent,
  variationKey?: string,
): MadameInteraction;
export declare function teacherInteraction(request: BalletTeacherRequest): MadameInteraction;
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
export declare function communityHelpResponse(variationKey?: string): string;
