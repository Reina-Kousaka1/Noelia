import React from "react";
import type { SectionId } from "./section";
import { useAcademyProfile } from "../profile/useAcademyProfile";
import { devProfileDataLabel } from "../profile/devProfileSource";

type HomeScreenProps = {
  onNavigate: (section: SectionId) => void;
};

const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
  const { profile } = useAcademyProfile();

  return (
  <section className="page-screen home-screen" aria-labelledby="home-title">
    <p className="screen-eyebrow">A place to begin</p>
    <h1 className="screen-title" id="home-title">Welcome to your studio</h1>
    <p className="screen-intro">
      A quiet corner for practice, poise, and the joy of learning ballet.
    </p>

    <article className="home-hero">
      <div className="home-hero-copy">
        <span className="home-hero-kicker">TODAY AT NOÉLIA</span>
        <h2>A little practice makes room for grace.</h2>
        <p>Begin with one gentle rhythm exercise, guided by Madame.</p>
        {profile && (
          <div className="home-stage-preview">
            <span>{devProfileDataLabel}</span>
            <strong>{profile.academy.currentStage.title} · Ballet level {profile.ballet.level}</strong>
          </div>
        )}
        <button
          className="primary-action"
          type="button"
          onClick={() => onNavigate("training")}
        >
          Visit Training <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className="home-hero-art" aria-hidden="true">
        <span className="hero-art-ring" />
        <span className="hero-art-ribbon hero-art-ribbon-one" />
        <span className="hero-art-ribbon hero-art-ribbon-two" />
        <span className="hero-art-flower">✿</span>
        <span className="hero-art-sparkle">✧</span>
      </div>
    </article>

    <div className="home-section-heading">
      <div>
        <p className="screen-eyebrow">EXPLORE YOUR ACADEMY</p>
        <h2>Choose a room</h2>
      </div>
      <span className="home-heading-flourish" aria-hidden="true">❧</span>
    </div>
    <div className="home-room-grid">
      <button className="room-card" type="button" onClick={() => onNavigate("academy")}>
        <span className="room-card-icon room-icon-academy" aria-hidden="true">✧</span>
        <span className="room-card-copy">
          <strong>The Academy</strong>
          <small>Meet the studio and its traditions</small>
        </span>
        <span className="room-card-arrow" aria-hidden="true">↗</span>
      </button>
      <button className="room-card" type="button" onClick={() => onNavigate("wardrobe")}>
        <span className="room-card-icon room-icon-wardrobe" aria-hidden="true">♧</span>
        <span className="room-card-copy">
          <strong>Wardrobe preview</strong>
          <small>See a layered local appearance</small>
        </span>
        <span className="room-card-arrow" aria-hidden="true">↗</span>
      </button>
      <button className="room-card" type="button" onClick={() => onNavigate("profile")}>
        <span className="room-card-icon room-icon-profile" aria-hidden="true">♡</span>
        <span className="room-card-copy">
          <strong>Your profile</strong>
          <small>View the safe development preview</small>
        </span>
        <span className="room-card-arrow" aria-hidden="true">↗</span>
      </button>
    </div>

    <section className="coming-panel" aria-labelledby="coming-title">
      <div className="coming-panel-heading">
        <div>
          <p className="screen-eyebrow">IN TIME</p>
          <h2 id="coming-title">More of the Academy</h2>
        </div>
        <span className="coming-stamp">COMING SOON</span>
      </div>
      <div className="coming-chips">
        <span><i aria-hidden="true">✧</i> Boutique</span>
        <span><i aria-hidden="true">✧</i> Schedule</span>
        <span><i aria-hidden="true">✧</i> Report Cards</span>
      </div>
    </section>
  </section>
  );
};

export default HomeScreen;
