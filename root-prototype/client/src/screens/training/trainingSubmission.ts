import { academyTrainingServiceClient } from "@noelia-root/gen-client";
import { TrainingErrorCode, TrainingOutcome } from "@noelia-root/gen-shared";
import type { TrainingResult } from "@noelia-root/gen-shared";
import type { ExerciseId } from "./exerciseCatalog";
import type { MadameMood } from "../../components/Madame";

export type TrainingSubmissionErrorKind = "network" | "malformed" | "unsupported";

export class TrainingSubmissionError extends Error {
  constructor(
    readonly kind: TrainingSubmissionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "TrainingSubmissionError";
  }
}

const userErrorMessages: Record<TrainingSubmissionErrorKind, string> = {
  network: "The studio connection is unavailable. Your attempt is still here; please try sending it again.",
  malformed: "Madame could not read that response. Your attempt is still here; please try again.",
  unsupported: "This exercise is not available on the studio server yet.",
};

export async function submitTrainingAttempt(
  exerciseId: ExerciseId,
  interactionData: readonly number[],
): Promise<TrainingResult> {
  let response: TrainingResult;
  try {
    response = await academyTrainingServiceClient.submitAttempt({
      exerciseId,
      interactionData: [...interactionData],
    });
  } catch {
    throw new TrainingSubmissionError("network", userErrorMessages.network);
  }

  if (!isTrainingResult(response)) {
    throw new TrainingSubmissionError("malformed", userErrorMessages.malformed);
  }

  if (response.errorCode === TrainingErrorCode.UNSUPPORTED_EXERCISE) {
    throw new TrainingSubmissionError("unsupported", userErrorMessages.unsupported);
  }
  if (response.errorCode === TrainingErrorCode.MALFORMED_INPUT) {
    throw new TrainingSubmissionError("malformed", userErrorMessages.malformed);
  }
  if (response.errorCode !== TrainingErrorCode.NONE) {
    throw new TrainingSubmissionError("malformed", userErrorMessages.malformed);
  }

  const validOutcome =
    response.outcome === TrainingOutcome.PERFECT ||
    response.outcome === TrainingOutcome.SUCCESS ||
    response.outcome === TrainingOutcome.SHAKY ||
    response.outcome === TrainingOutcome.FAIL;
  if (
    response.exerciseId !== exerciseId ||
    typeof response.exerciseName !== "string" ||
    response.exerciseName.trim().length === 0 ||
    typeof response.madameFeedback !== "string" ||
    response.madameFeedback.trim().length === 0 ||
    !validOutcome
  ) {
    throw new TrainingSubmissionError("malformed", userErrorMessages.malformed);
  }

  return response;
}

export function trainingMoodForOutcome(outcome: TrainingOutcome): MadameMood {
  switch (outcome) {
    case TrainingOutcome.PERFECT:
      return "celebrating";
    case TrainingOutcome.SUCCESS:
      return "approving";
    case TrainingOutcome.SHAKY:
    case TrainingOutcome.FAIL:
      return "correcting";
    default:
      return "explaining";
  }
}

export function trainingOutcomeLabel(outcome: TrainingOutcome): string {
  switch (outcome) {
    case TrainingOutcome.PERFECT:
      return "Perfect";
    case TrainingOutcome.SUCCESS:
      return "Lovely work";
    case TrainingOutcome.SHAKY:
      return "A little shaky";
    case TrainingOutcome.FAIL:
      return "Try again";
    default:
      return "Review complete";
  }
}

export function trainingOutcomeClass(outcome: TrainingOutcome): string {
  switch (outcome) {
    case TrainingOutcome.PERFECT:
      return "perfect";
    case TrainingOutcome.SUCCESS:
      return "success";
    case TrainingOutcome.SHAKY:
      return "shaky";
    case TrainingOutcome.FAIL:
      return "fail";
    default:
      return "unspecified";
  }
}

function isTrainingResult(value: unknown): value is TrainingResult {
  return typeof value === "object" && value !== null;
}
