import React from "react";
import { TrainingOutcome } from "@noelia-root/gen-shared";
import {
  trainingOutcomeClass,
  trainingOutcomeLabel,
} from "./trainingSubmission";

type TrainingExerciseFrameProps = {
  readonly phaseLabel: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
};

export const TrainingExerciseFrame: React.FC<TrainingExerciseFrameProps> = ({
  phaseLabel,
  onClose,
  children,
}) => (
  <section className="exercise-player" aria-label="Training exercise">
    <div className="player-header">
      <button className="back-action" type="button" onClick={onClose}>
        <span aria-hidden="true">←</span> All exercises
      </button>
      <span className="player-step-label">{phaseLabel}</span>
    </div>
    {children}
  </section>
);

type TrainingResultCardProps = {
  readonly exerciseName: string;
  readonly outcome: TrainingOutcome;
  readonly madameFeedback: string;
  readonly onReplay: () => void;
};

export const TrainingResultCard: React.FC<TrainingResultCardProps> = ({
  exerciseName,
  outcome,
  madameFeedback,
  onReplay,
}) => {
  return (
    <div className="exercise-phase-card result-phase" aria-live="polite">
      <div className="result-seal" aria-hidden="true">✧</div>
      <p className="screen-eyebrow">YOUR PRACTICE RESULT</p>
      <h2>{exerciseName}</h2>
      <span className={`outcome-pill outcome-${trainingOutcomeClass(outcome)}`}>
        {trainingOutcomeLabel(outcome)}
      </span>
      <blockquote>“{madameFeedback}”</blockquote>
      <button className="primary-action" type="button" onClick={onReplay}>
        Practise again <span aria-hidden="true">↻</span>
      </button>
    </div>
  );
};
