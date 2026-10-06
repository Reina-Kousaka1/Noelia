import React, { useState } from "react";
import { madameLine } from "@noelia-root/persona";
import type { ComponentType } from "react";
import type { MadameMood } from "../components/Madame";
import ClapRhythmExercise from "./training/ClapRhythmExercise";
import FirstPositionsExercise from "./training/FirstPositionsExercise";
import PortDeBrasExercise from "./training/PortDeBrasExercise";
import { exerciseCatalog, ExerciseId } from "./training/exerciseCatalog";

type ExercisePlayerProps = {
  onMadameUpdate: (mood: MadameMood, message: string) => void;
  onClose: () => void;
};

const exercisePlayers: Partial<Record<ExerciseId, ComponentType<ExercisePlayerProps>>> = {
  "clap-rhythm": ClapRhythmExercise,
  "first-positions": FirstPositionsExercise,
  "port-de-bras": PortDeBrasExercise,
};

type TrainingScreenProps = {
  onMadameUpdate: (mood: MadameMood, message: string) => void;
};

const TrainingScreen: React.FC<TrainingScreenProps> = ({ onMadameUpdate }) => {
  const [selectedExercise, setSelectedExercise] = useState<ExerciseId | null>(null);
  const Player = selectedExercise ? exercisePlayers[selectedExercise] : undefined;

  const openExercise = (id: ExerciseId): void => {
    setSelectedExercise(id);
    onMadameUpdate("greeting", madameLine("greeting", id));
  };

  if (selectedExercise && Player) {
    return (
      <section className="page-screen" aria-labelledby="training-title">
        <p className="screen-eyebrow">THE PRACTICE FLOOR</p>
        <h1 className="screen-title" id="training-title">Training</h1>
        <Player
          onMadameUpdate={onMadameUpdate}
          onClose={() => setSelectedExercise(null)}
        />
      </section>
    );
  }

  return (
    <section className="page-screen" aria-labelledby="training-title">
      <p className="screen-eyebrow">THE PRACTICE FLOOR</p>
      <h1 className="screen-title" id="training-title">Training</h1>
      <p className="screen-intro">
        Choose an exercise and give it your full attention. Madame will guide your first practice.
      </p>

      <div className="exercise-catalog" aria-label="Academy exercises">
        {exerciseCatalog.map((exercise, index) => {
          const isPlayable = exercise.availability === "playable";
          return (
            <article className={`catalog-card ${isPlayable ? "catalog-card-playable" : "catalog-card-preview"}`} key={exercise.id}>
              <span className="catalog-number">0{index + 1}</span>
              <div className={`catalog-icon catalog-icon-${exercise.id}`} aria-hidden="true">
                {exercise.id === "clap-rhythm" ? "♩" : exercise.id === "first-positions" ? "Ⅰ" : "✧"}
              </div>
              <div className="catalog-copy">
                <span className="catalog-focus">{exercise.focus}</span>
                <h2>{exercise.title}</h2>
                <p>{exercise.description}</p>
                <span className="catalog-duration">{exercise.duration}</span>
              </div>
              {isPlayable ? (
                <button className="catalog-action" type="button" onClick={() => openExercise(exercise.id)}>
                  Begin <span aria-hidden="true">↗</span>
                </button>
              ) : (
                <span className="catalog-coming">COMING SOON</span>
              )}
            </article>
          );
        })}
      </div>
      <p className="training-safety-note">
        <span aria-hidden="true">✧</span> These early lessons are small steps in a larger Academy.
      </p>
    </section>
  );
};

export default TrainingScreen;
