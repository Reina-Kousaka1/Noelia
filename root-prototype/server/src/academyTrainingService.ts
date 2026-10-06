import { Client } from "@rootsdk/server-app";
import {
  TrainingAttemptRequest,
  TrainingErrorCode,
  TrainingOutcome,
  TrainingResult,
} from "@noelia-root/gen-shared";
import { AcademyTrainingServiceBase } from "@noelia-root/gen-server";

const exerciseNames: Readonly<Record<string, string>> = {
  "clap-rhythm": "Clap Rhythm",
  "first-positions": "First Positions",
  "port-de-bras": "Port de Bras",
};

const firstPositionSequence = [1, 2, 3, 4, 5];
const portDeBrasSequence = [0, 1, 3, 2, 0];

export class AcademyTrainingService extends AcademyTrainingServiceBase {
  async submitAttempt(
    request: TrainingAttemptRequest,
    client: Client,
  ): Promise<TrainingResult> {
    void client;

    const exerciseId = typeof request?.exerciseId === "string" ? request.exerciseId : "";
    const exerciseName = Object.prototype.hasOwnProperty.call(exerciseNames, exerciseId)
      ? exerciseNames[exerciseId]
      : undefined;
    if (typeof exerciseName !== "string") {
      return this.errorResult(
        exerciseId,
        "This exercise is not available yet.",
        TrainingErrorCode.UNSUPPORTED_EXERCISE,
      );
    }

    const interactionData = request.interactionData;
    if (!Array.isArray(interactionData) || !interactionData.every(isNonNegativeInteger)) {
      return this.errorResult(
        exerciseId,
        "Madame could not read that attempt. Please begin again.",
        TrainingErrorCode.MALFORMED_INPUT,
      );
    }

    if (exerciseId === "clap-rhythm") {
      if (interactionData.length !== 1 || interactionData[0] > 8) {
        return this.errorResult(
          exerciseId,
          "Madame could not read that rhythm. Please try the count again.",
          TrainingErrorCode.MALFORMED_INPUT,
        );
      }
      return this.successResult(exerciseId, exerciseName, evaluateClapCount(interactionData[0]));
    }

    if (exerciseId === "first-positions") {
      if (
        interactionData.length > firstPositionSequence.length ||
        interactionData.some((position) => position < 1 || position > 5)
      ) {
        return this.errorResult(
          exerciseId,
          "Madame could not read those positions. Please arrange them again.",
          TrainingErrorCode.MALFORMED_INPUT,
        );
      }
      return this.successResult(
        exerciseId,
        exerciseName,
        evaluateSequence(interactionData, firstPositionSequence),
      );
    }

    if (
      interactionData.length > portDeBrasSequence.length ||
      interactionData.some((position) => position > 3)
    ) {
      return this.errorResult(
        exerciseId,
        "Madame could not read that arm sequence. Please begin it again.",
        TrainingErrorCode.MALFORMED_INPUT,
      );
    }
    return this.successResult(
      exerciseId,
      exerciseName,
      evaluateSequence(interactionData, portDeBrasSequence),
    );
  }

  private successResult(
    exerciseId: string,
    exerciseName: string,
    outcome: TrainingOutcome,
  ): TrainingResult {
    return {
      exerciseId,
      exerciseName,
      outcome,
      madameFeedback: feedbackFor(outcome),
      errorCode: TrainingErrorCode.NONE,
    };
  }

  private errorResult(
    exerciseId: string,
    madameFeedback: string,
    errorCode: TrainingErrorCode,
  ): TrainingResult {
    return {
      exerciseId,
      exerciseName: exerciseNames[exerciseId] ?? "Training exercise",
      outcome: TrainingOutcome.TRAINING_OUTCOME_UNSPECIFIED,
      madameFeedback,
      errorCode,
    };
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function evaluateClapCount(count: number): TrainingOutcome {
  if (count === 4) return TrainingOutcome.PERFECT;
  if (count === 3 || count === 5) return TrainingOutcome.SUCCESS;
  if (count === 2 || count === 6) return TrainingOutcome.SHAKY;
  return TrainingOutcome.FAIL;
}

function evaluateSequence(
  submitted: readonly number[],
  expected: readonly number[],
): TrainingOutcome {
  const correctSteps = submitted.reduce(
    (correct, step, index) => correct + (step === expected[index] ? 1 : 0),
    0,
  );

  if (submitted.length === expected.length && correctSteps === expected.length) {
    return TrainingOutcome.PERFECT;
  }
  if (correctSteps >= 4) return TrainingOutcome.SUCCESS;
  if (correctSteps >= 2) return TrainingOutcome.SHAKY;
  return TrainingOutcome.FAIL;
}

function feedbackFor(outcome: TrainingOutcome): string {
  switch (outcome) {
    case TrainingOutcome.PERFECT:
      return "Beautifully precise, ma chère. Your careful work shows.";
    case TrainingOutcome.SUCCESS:
      return "A lovely beginning. Keep your attention on each clear position.";
    case TrainingOutcome.SHAKY:
      return "A few details wandered. Breathe, and place each movement with care.";
    case TrainingOutcome.FAIL:
    default:
      return "Every dancer learns one step at a time. Let us try the sequence once more.";
  }
}

export const academyTrainingService = new AcademyTrainingService();
