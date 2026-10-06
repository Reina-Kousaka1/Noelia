import React, { useState } from "react";
import type { MadameMood } from "../../components/Madame";
import { TrainingExerciseFrame, TrainingResultCard } from "./TrainingExerciseFrame";
import { useTrainingSubmission } from "./useTrainingSubmission";

type FirstPositionsExerciseProps = {
  onMadameUpdate: (mood: MadameMood, message: string) => void;
  onClose: () => void;
};

type ExercisePhase = "start" | "instructions" | "active" | "result";

const positions = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: 5, label: "Fifth" },
];

const FirstPositionsExercise: React.FC<FirstPositionsExerciseProps> = ({
  onMadameUpdate,
  onClose,
}) => {
  const [phase, setPhase] = useState<ExercisePhase>("start");
  const [sequence, setSequence] = useState<number[]>([]);
  const submission = useTrainingSubmission("first-positions", onMadameUpdate);

  const showInstructions = (): void => {
    setPhase("instructions");
    onMadameUpdate("explaining", "We shall place each position in order. Take your time, ma chère.");
  };

  const beginPractice = (): void => {
    setSequence([]);
    submission.reset();
    setPhase("active");
    onMadameUpdate("explaining", "Begin with first position, then continue carefully through fifth.");
  };

  const recordPosition = (value: number): void => {
    setSequence((current) => current.length < positions.length ? [...current, value] : current);
  };

  const askForReview = async (): Promise<void> => {
    const result = await submission.submit(sequence);
    if (result) setPhase("result");
  };

  const replay = (): void => {
    setSequence([]);
    submission.reset();
    setPhase("start");
    onMadameUpdate("greeting", "A new beginning, ma chère. Let us place the feet with care.");
  };

  const phaseLabel = {
    start: "READY WHEN YOU ARE",
    instructions: "MADAME’S EXPLANATION",
    active: "YOUR PRACTICE",
    result: "MADAME’S REVIEW",
  }[phase];

  return (
    <TrainingExerciseFrame phaseLabel={phaseLabel} onClose={onClose}>
      {phase === "start" && (
        <div className="exercise-phase-card" key="start">
          <div className="player-emblem position-emblem" aria-hidden="true"><span>Ⅰ</span><i>✧</i></div>
          <p className="screen-eyebrow">BALLET FOUNDATIONS</p>
          <h2>First Positions</h2>
          <p className="phase-copy">
            A gentle introduction to the five classical foot positions, reviewed by Madame.
          </p>
          <button className="primary-action" type="button" onClick={showInstructions}>
            Begin exercise <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}

      {phase === "instructions" && (
        <div className="exercise-phase-card" key="instructions">
          <div className="phase-number">01 <span>INSTRUCTIONS</span></div>
          <h2>Place first through fifth.</h2>
          <p className="phase-copy">
            Madame will review the order you choose. This is a simple practice prompt, not a posture assessment.
          </p>
          <div className="position-demonstration" aria-label="First, second, third, fourth, fifth">
            {positions.map((position) => (
              <span className="position-demo-step" key={position.value}>
                <strong>{position.value}</strong><small>{position.label}</small>
              </span>
            ))}
          </div>
          <button className="primary-action" type="button" onClick={beginPractice}>
            I’m ready <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}

      {phase === "active" && (
        <div className="exercise-phase-card active-phase" key="active">
          <p className="screen-eyebrow">A CAREFUL SEQUENCE</p>
          <h2>Choose each position in order</h2>
          <p className="phase-copy">Tap first, second, third, fourth, and fifth as you practise them.</p>
          <div className="position-choice-grid" aria-label="Ballet position choices">
            {positions.map((position) => (
              <button
                className="position-choice"
                type="button"
                key={position.value}
                onClick={() => recordPosition(position.value)}
                disabled={sequence.length >= positions.length || submission.isSubmitting}
                aria-label={`Add ${position.label} position`}
              >
                <strong>{position.value}</strong>
                <span>{position.label}</span>
              </button>
            ))}
          </div>
          <div className="selected-sequence" aria-live="polite">
            <span className="profile-card-label">YOUR ORDER</span>
            <strong>{sequence.length ? sequence.map((value) => positions[value - 1]?.value).join(" · ") : "Tap a position to begin"}</strong>
            <small>{sequence.length} of 5 selected</small>
          </div>
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

export default FirstPositionsExercise;
