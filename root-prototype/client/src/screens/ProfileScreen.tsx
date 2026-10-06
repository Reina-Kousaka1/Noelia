import React from "react";
import type { SectionId } from "./section";
import { devProfileDataLabel } from "../profile/devProfileSource";
import { AcademyProfileSummary } from "../profile/ProfileReadModel";
import { useAcademyProfile } from "../profile/useAcademyProfile";

type ProfileScreenProps = {
  onNavigate: (section: SectionId) => void;
};

const ProfileScreen: React.FC<ProfileScreenProps> = ({ onNavigate }) => {
  const { profile, isLoading, hasError } = useAcademyProfile();

  return (
    <section className="page-screen" aria-labelledby="profile-title">
      <p className="screen-eyebrow">YOUR ACADEMY RECORD</p>
      <h1 className="screen-title" id="profile-title">Profile</h1>
      <p className="screen-intro">
        A read-only view of your Academy stage, Ballet skills, results, and equipped outfit.
      </p>

      <div className="profile-data-banner">
        <span className="data-source-mark" aria-hidden="true">i</span>
        <span>{devProfileDataLabel}</span>
      </div>

      <article className="profile-identity-card">
        <div className="profile-monogram" aria-hidden="true">N</div>
        <div>
          <span className="home-hero-kicker">NOÉLIA ACADEMY</span>
          <h2>Student profile</h2>
          <p>Profile data is supplied through the shared Academy read model.</p>
        </div>
      </article>

      {isLoading && (
        <div className="notice-card" role="status">Preparing your Academy profile…</div>
      )}
      {hasError && (
        <div className="notice-card notice-error" role="alert">
          The profile could not be loaded. Please return later and try again.
        </div>
      )}
      {profile && (
        <div className="profile-read-model-grid">
          <AcademyProfileSummary profile={profile} />
          <article className="read-model-card profile-future-records">
            <span className="profile-card-label">OTHER ACADEMY RECORDS</span>
            <h2>More details can join this profile later</h2>
            <p className="read-model-description">
              Attendance, scheduled classes, recovery, and report cards are not part of the
              inspected Noélia main domain model yet.
            </p>
          </article>
        </div>
      )}

      <div className="profile-outfit-action">
        <button className="text-action" type="button" onClick={() => onNavigate("wardrobe")}>
          Open local Wardrobe preview <span aria-hidden="true">↗</span>
        </button>
        <span>Appearance examples are local and are not inventory items.</span>
      </div>
    </section>
  );
};

export default ProfileScreen;
