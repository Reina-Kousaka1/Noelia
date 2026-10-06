import React from "react";
import type { SectionId } from "./section";
import { devProfileDataLabel } from "../profile/devProfileSource";
import {
  AcademyStageCard,
  AssessmentHistoryCard,
  BalletSkillsCard,
  TrainingStatusCard,
} from "../profile/ProfileReadModel";
import { useAcademyProfile } from "../profile/useAcademyProfile";

type AcademyScreenProps = {
  onNavigate: (section: SectionId) => void;
};

const principles = [
  { number: "I", title: "Attention", text: "Listen closely to the music and to your own movement." },
  { number: "II", title: "Patience", text: "A sure foundation is built one thoughtful lesson at a time." },
  { number: "III", title: "Grace", text: "Discipline and kindness belong in the same studio." },
];

const AcademyScreen: React.FC<AcademyScreenProps> = ({ onNavigate }) => {
  const { profile, isLoading, hasError } = useAcademyProfile();

  return (
    <section className="page-screen" aria-labelledby="academy-title">
      <p className="screen-eyebrow">OUR HOUSE OF BALLET</p>
      <h1 className="screen-title" id="academy-title">The Academy</h1>
      <p className="screen-intro">
        Noélia is a place to learn with care, find your rhythm, and grow into each movement.
      </p>

      <article className="academy-welcome-card">
        <span className="academy-card-ornament" aria-hidden="true">✧</span>
        <div className="academy-welcome-copy">
          <span className="home-hero-kicker">A NOTE FROM MADAME</span>
          <h2>“Good technique is a gift you give to every step.”</h2>
          <p>Begin gently. Listen carefully. Let the work speak for itself.</p>
        </div>
      </article>

      <div className="profile-data-banner">
        <span className="data-source-mark" aria-hidden="true">i</span>
        <span>{devProfileDataLabel}</span>
      </div>

      {isLoading && (
        <div className="notice-card" role="status">Preparing the Academy profile…</div>
      )}
      {hasError && (
        <div className="notice-card notice-error" role="alert">
          The Academy profile could not be loaded. Please return later and try again.
        </div>
      )}
      {profile && (
        <section className="academy-domain-section" aria-labelledby="academy-record-title">
          <div className="home-section-heading">
            <div>
              <p className="screen-eyebrow">ACADEMY RECORD</p>
              <h2 id="academy-record-title">Your place in the studio</h2>
            </div>
          </div>
          <div className="academy-read-model-grid">
            <AcademyStageCard progress={profile.academy} />
            <BalletSkillsCard skills={profile.skills} progression={profile.ballet} />
            <TrainingStatusCard statuses={profile.trainingStatuses} />
            <AssessmentHistoryCard assessments={profile.assessments} />
          </div>
        </section>
      )}

      <div className="home-section-heading academy-principles-heading">
        <div>
          <p className="screen-eyebrow">THE NOÉLIA WAY</p>
          <h2>Our studio principles</h2>
        </div>
      </div>
      <div className="principle-grid">
        {principles.map((principle) => (
          <article className="principle-card" key={principle.number}>
            <span className="principle-number">{principle.number}</span>
            <h3>{principle.title}</h3>
            <p>{principle.text}</p>
          </article>
        ))}
      </div>

      <div className="academy-next-step">
        <div>
          <span className="home-hero-kicker">YOUR NEXT PRACTICE</span>
          <h2>Ready to step onto the floor?</h2>
        </div>
        <button className="primary-action" type="button" onClick={() => onNavigate("training")}>
          Go to Training <span aria-hidden="true">↗</span>
        </button>
      </div>
    </section>
  );
};

export default AcademyScreen;
