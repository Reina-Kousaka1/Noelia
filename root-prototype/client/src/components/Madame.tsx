import React from "react";
import { moodLabels } from "@noelia-root/persona";
import type { MadameMood } from "@noelia-root/persona";
import "./Madame.css";

export type { MadameMood };

type MadameProps = {
  mood: MadameMood;
  message: string;
  onSpeak: () => void;
};

const Madame: React.FC<MadameProps> = ({ mood, message, onSpeak }) => (
  <aside className={`madame-card madame-${mood}`} aria-label="Madame's guidance">
    <button
      className="madame-portrait-button"
      type="button"
      onClick={onSpeak}
      aria-label="Ask Madame for another word of guidance"
    >
      <span className="madame-portrait" key={mood} aria-hidden="true">
        <span className="madame-hair" />
        <span className="madame-face" />
        <span className="madame-neck" />
        <span className="madame-jacket" />
        <span className="madame-bow" />
        <span className="madame-pearl madame-pearl-left" />
        <span className="madame-pearl madame-pearl-right" />
        <span className="madame-spark">✦</span>
      </span>
    </button>
    <div className="madame-copy">
      <div className="madame-label-row">
        <span className="madame-name">Madame</span>
        <span className="madame-mood-label">{moodLabels[mood]}</span>
      </div>
      <p key={`${mood}:${message}`} className="madame-message">{message}</p>
    </div>
    <button
      className="madame-again"
      type="button"
      onClick={onSpeak}
      aria-label="Ask Madame for another word of guidance"
    >
      <span aria-hidden="true">↻</span>
    </button>
  </aside>
);

export default Madame;
