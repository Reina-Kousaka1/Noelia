import React, { useState } from "react";
import { exerciseGuidance } from "@noelia-root/persona";
import type { MadameMood } from "../../components/Madame";
import { TrainingExerciseFrame, TrainingResultCard } from "./TrainingExerciseFrame";
import { useTrainingSubmission } from "./useTrainingSubmission";

type PortDeBrasExerciseProps = {
  onMadameUpdate: (mood: MadameMood, message: string) => void;
  onClose: () => void;
};

type ExercisePhase = "start" | "instructions" | "demonstration" | "active" | "result";

const armPositions = [
  { value: 0, label: "Bras bas", mark: "⌒" },
  { value: 1, label: "First", mark: "♡" },
  { value: 2, label: "Second", mark: "↔" },
  { value: 3, label: "Fifth high", mark: "⌒" },
];

const demonstratedSequence = [0, 1, 3, 2, 0];

const PortDeBrasExercise: React.FC<PortDeBrasExerciseProps> = ({
  onMadameUpdate,
  onClose,
}) => {
  const [phase, setPhase] = useState<ExercisePhase>("start");
  const [sequence, setSequence] = useState<number[]>([]);
  const submission = useTrainingSubmission("port-de-bras", onMadameUpdate);

  const showInstructions = (): void => {
    setPhase("instructions");
    onMadameUpdate("explaining", exerciseGuidance("port-de-bras", "explain"));
  };

  const showDemonstration = (): void => {
    setPhase("demonstration");
    onMadameUpdate("explaining", exerciseGuidance("port-de-bras", "observe"));
  };

  const beginPractice = (): void => {
    setSequence([]);
    submission.reset();
    setPhase("active");
    onMadameUpdate("explaining", exerciseGuidance("port-de-bras", "begin"));
  };

  const recordArmPosition = (value: number): void => {
    setSequence((current) => current.length < demonstratedSequence.length ? [...current, value] : current);
  };

  const askForReview = async (): Promise<void> => {
    const result = await submission.submit(sequence);
    if (result) setPhase("result");
  };

  const replay = (): void => {
    setSequence([]);
    submission.reset();
    setPhase("start");
    onMadameUpdate("greeting", exerciseGuidance("port-de-bras", "replay"));
  };

  const phaseLabel = {
    start: "READY WHEN YOU ARE",
    instructions: "MADAME’S EXPLANATION",
    demonstration: "WATCH THE SEQUENCE",
    active: "YOUR PRACTICE",
    result: "MADAME’S REVIEW",
  }[phase];

  return (
    <TrainingExerciseFrame phaseLabel={phaseLabel} onClose={onClose}>
      {phase === "start" && (
        <div className="exercise-phase-card" key="start">
          <div className="player-emblem port-emblem" aria-hidden="true"><span>⌒</span><i>✧</i></div>
          <p className="screen-eyebrow">ARMS &amp; EXPRESSION</p>
          <h2>Port de Bras</h2>
          <p className="phase-copy">
            Follow a short arm sequence, then reproduce it for Madame’s review.
          </p>
          <button className="primary-action" type="button" onClick={showInstructions}>
            Begin exercise <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}

      {phase === "instructions" && (
        <div className="exercise-phase-card" key="instructions">
          <div className="phase-number">01 <span>INSTRUCTIONS</span></div>
          <h2>Let the arms move gently.</h2>
          <p className="phase-copy">
            Madame will demonstrate five positions. Remember their order, then tap the matching controls.
          </p>
          <button className="primary-action" type="button" onClick={showDemonstration}>
            Watch Madame <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}

      {phase === "demonstration" && (
        <div className="exercise-phase-card" key="demonstration">
          <div className="phase-number">02 <span>DEMONSTRATION</span></div>
          <h2>A quiet, even phrase</h2>
          <p className="phase-copy">Bras bas, first, fifth high, second, then return to bras bas.</p>
          <ol className="bras-sequence-demo" aria-label="Demonstrated arm sequence">
            {demonstratedSequence.map((value, index) => {
              const position = armPositions[value];
              return (
                <li key={`${index}-${value}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong aria-hidden="true">{position?.mark}</strong>
                  <small>{position?.label}</small>
                </li>
              );
            })}
          </ol>
          <button className="primary-action" type="button" onClick={beginPractice}>
            I’m ready <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}

      {phase === "active" && (
        <div className="exercise-phase-card active-phase" key="active">
          <p className="screen-eyebrow">REPRODUCE MADAME’S ORDER</p>
          <h2>Choose each arm position</h2>
          <div className="bras-position-grid" aria-label="Arm position choices">
            {armPositions.map((position) => (
              <button
                className="bras-position-choice"
                type="button"
                key={position.value}
                onClick={() => recordArmPosition(position.value)}
                disabled={sequence.length >= demonstratedSequence.length || submission.isSubmitting}
              >
                <strong aria-hidden="true">{position.mark}</strong>
                <span>{position.label}</span>
              </button>
            ))}
          </div>
          <ol className="bras-selected-sequence" aria-label="Your selected sequence" aria-live="polite">
            {sequence.length ? sequence.map((value, index) => (
              <li key={`${index}-${value}`}><span>{index + 1}</span>{armPositions[value]?.label}</li>
            )) : <li className="sequence-empty">Tap an arm position to begin</li>}
          </ol>
          <div className="sequence-edit-actions">
            <button className="text-action" type="button" onClick={() => setSequence((items) => items.slice(0, -1))} disabled={!sequence.length || submission.isSubmitting}>
              Undo last
            </button>
            <button className="text-action" type="button" onClick={() => setSequence([])} disabled={!sequence.length || submission.isSubmitting}>
              Clear order
            </button>
          </div>
          {submission.error && <p className="notice-error inline-error" role="alert">{submission.error}</p>}
          <div className="player-actions">
            <button className="primary-action" type="button" onClick={askForReview} disabled={submission.isSubmitting}>
              {submission.isSubmitting ? "Madame is reviewing…" : "Send to Madame"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      )}

      {phase === "result" && submission.result && (
        <TrainingResultCard
          exerciseName={submission.result.exerciseName}
          outcome={submission.result.outcome}
          madameFeedback={submission.result.madameFeedback}
          onReplay={replay}
        />
      )}
    </TrainingExerciseFrame>
  );
};

export default PortDeBrasExercise;
