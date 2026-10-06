import React, { useState } from "react";
import type { MadameMood } from "../../components/Madame";
import { TrainingExerciseFrame, TrainingResultCard } from "./TrainingExerciseFrame";
import { useTrainingSubmission } from "./useTrainingSubmission";

type ClapRhythmExerciseProps = {
  onMadameUpdate: (mood: MadameMood, message: string) => void;
  onClose: () => void;
};

type ExercisePhase = "start" | "instructions" | "active" | "result";

const ClapRhythmExercise: React.FC<ClapRhythmExerciseProps> = ({
  onMadameUpdate,
  onClose,
}) => {
  const [phase, setPhase] = useState<ExercisePhase>("start");
  const [clapCount, setClapCount] = useState(0);
  const submission = useTrainingSubmission("clap-rhythm", onMadameUpdate);

  const showInstructions = (): void => {
    setPhase("instructions");
    onMadameUpdate("explaining", "Four even beats, ma chère. Listen for the space between them.");
  };

  const beginPractice = (): void => {
    setClapCount(0);
    submission.reset();
    setPhase("active");
    onMadameUpdate("explaining", "When you are ready, tap once for each beat.");
  };

  const askForReview = async (): Promise<void> => {
    const result = await submission.submit([clapCount]);
    if (result) setPhase("result");
  };

  const replay = (): void => {
    setClapCount(0);
    submission.reset();
    setPhase("start");
    onMadameUpdate("greeting", "A fresh beginning, ma chère. Shall we try again?");
  };

  const phaseLabel = {
    start: "READY WHEN YOU ARE",
    instructions: "BEFORE WE BEGIN",
    active: "YOUR PRACTICE",
    result: "MADAME’S REVIEW",
  }[phase];

  return (
    <TrainingExerciseFrame phaseLabel={phaseLabel} onClose={onClose}>
      {phase === "start" && (
        <div className="exercise-phase-card" key="start">
          <div className="player-emblem" aria-hidden="true"><span>♩</span><i>✧</i></div>
          <p className="screen-eyebrow">RHYTHM &amp; MUSICALITY</p>
          <h2>Clap Rhythm</h2>
          <p className="phase-copy">
            A short listening exercise to help you settle into a steady four-count.
          </p>
          <button className="primary-action" type="button" onClick={showInstructions}>
            Begin exercise <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}

      {phase === "instructions" && (
        <div className="exercise-phase-card" key="instructions">
          <div className="phase-number">01 <span>INSTRUCTIONS</span></div>
          <h2>Find four even beats.</h2>
          <p className="phase-copy">
            Tap the rose once for each clap. When you are ready, Madame will review the count.
          </p>
          <div className="instruction-beats" aria-hidden="true">
            {[1, 2, 3, 4].map((beat) => <span key={beat}>{beat}</span>)}
          </div>
          <button className="primary-action" type="button" onClick={beginPractice}>
            I’m ready <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}

      {phase === "active" && (
        <div className="exercise-phase-card active-phase" key="active">
          <div className="practice-instructions">
            <div>
              <p className="screen-eyebrow">KEEP A STEADY COUNT</p>
              <h2>Tap each beat</h2>
            </div>
            <span className="count-readout" aria-live="polite">
              <strong>{clapCount}</strong><span>/ 4</span>
            </span>
          </div>
          <div className="practice-beat-track" aria-label={`${clapCount} claps recorded`}>
            {[0, 1, 2, 3].map((beat) => (
              <span className={`practice-beat ${clapCount > beat ? "practice-beat-active" : ""}`} key={beat}>
                {beat + 1}
              </span>
            ))}
            {clapCount > 4 && <span className="extra-beats">+{clapCount - 4}</span>}
          </div>
          <button
            className="tap-button"
            type="button"
            onClick={() => setClapCount((count) => Math.min(count + 1, 8))}
            disabled={clapCount >= 8 || submission.isSubmitting}
            aria-label="Tap to record a clap"
          >
            <span className="tap-flower" aria-hidden="true">✿</span>
            <span>{clapCount >= 8 ? "Eight claps recorded" : "Tap for a clap"}</span>
            <span className="tap-helper">A gentle touch</span>
          </button>
          {submission.error && <p className="notice-error inline-error" role="alert">{submission.error}</p>}
          <div className="player-actions">
            <button
              className="primary-action"
              type="button"
              onClick={askForReview}
              disabled={submission.isSubmitting}
            >
              {submission.isSubmitting ? "Madame is listening…" : "Send to Madame"}
              <span aria-hidden="true">↗</span>
            </button>
            <button className="text-action" type="button" onClick={beginPractice} disabled={submission.isSubmitting}>
              Start count again
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

export default ClapRhythmExercise;
