import { useState } from "react";
import { connectionFeedback } from "@noelia-root/persona";
import type { TrainingResult } from "@noelia-root/gen-shared";
import type { MadameMood } from "../../components/Madame";
import type { ExerciseId } from "./exerciseCatalog";
import {
  submitTrainingAttempt,
  TrainingSubmissionError,
  trainingMoodForOutcome,
} from "./trainingSubmission";

type TrainingSubmissionState = {
  readonly result: TrainingResult | null;
  readonly error: string;
  readonly isSubmitting: boolean;
};

export function useTrainingSubmission(
  exerciseId: ExerciseId,
  onMadameUpdate: (mood: MadameMood, message: string) => void,
) {
  const [state, setState] = useState<TrainingSubmissionState>({
    result: null,
    error: "",
    isSubmitting: false,
  });

  const submit = async (interactionData: readonly number[]): Promise<TrainingResult | null> => {
    setState((current) => ({ ...current, error: "", isSubmitting: true }));
    try {
      const result = await submitTrainingAttempt(exerciseId, interactionData);
      setState({ result, error: "", isSubmitting: false });
      onMadameUpdate(
        // The result and reaction both come from the server response.
        trainingMoodForOutcome(result.outcome),
        result.madameFeedback,
      );
      return result;
    } catch (error) {
      const safeMessage =
        error instanceof TrainingSubmissionError
          ? error.message
          : "The studio connection is unavailable. Your attempt is still here; please try sending it again.";
      setState((current) => ({ ...current, error: safeMessage, isSubmitting: false }));
      onMadameUpdate("correcting", connectionFeedback());
      return null;
    }
  };

  const reset = (): void => setState({ result: null, error: "", isSubmitting: false });

  return { ...state, submit, reset };
}
