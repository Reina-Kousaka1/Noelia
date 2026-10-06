import React from "react";
import type {
  AcademyProfile,
  AcademyStageProgress,
  AssessmentSummary,
  BalletProgression,
  BalletSkills,
  TrainingStatus,
  WardrobeSummary,
} from "../domain/academyProfile";
import { mapOutfitToAvatarLayers } from "../avatar/wardrobeLayerAdapter";

const skillLabels = {
  technique: "Technique",
  flexibility: "Flexibility",
  musicality: "Musicality",
  performance: "Performance",
  pointe: "Pointe",
  stamina: "Stamina",
} as const;

export const AcademyStageCard: React.FC<{ progress: AcademyStageProgress }> = ({ progress }) => (
  <article className="read-model-card academy-stage-card">
    <div className="read-model-card-heading">
      <span className="profile-card-label">CURRENT ACADEMY STAGE</span>
      <span className="stage-count">{progress.completedStageCount} completed</span>
    </div>
    <h2>{progress.currentStage.title}</h2>
    <p className="read-model-description">{progress.currentStage.description}</p>
    {progress.nextStage && (
      <div className="next-stage-block">
        <span className="profile-card-label">NEXT STAGE · {progress.nextStage.title}</span>
        <p className="read-model-description">{progress.nextStage.description}</p>
        <ul className="requirement-list">
          {progress.nextStage.requirements.map((requirement) => (
            <li className={requirement.met ? "requirement-met" : ""} key={requirement.label}>
              <span aria-hidden="true">{requirement.met ? "✓" : "○"}</span>
              {requirement.label}
            </li>
          ))}
        </ul>
      </div>
    )}
  </article>
);

export const BalletSkillsCard: React.FC<{ skills: BalletSkills; progression: BalletProgression }> = ({
  skills,
  progression,
}) => (
  <article className="read-model-card">
    <div className="read-model-card-heading">
      <div>
        <span className="profile-card-label">BALLET PROGRESSION</span>
        <h2>Level {progression.level}</h2>
      </div>
      <span className="skill-card-flourish" aria-hidden="true">✧</span>
    </div>
    <p className="progression-caption">
      {progression.xpToNextLevel === null
        ? "Maximum Ballet level reached"
        : `${progression.xpToNextLevel.toString()} XP to the next level`}
    </p>
    <div className="domain-skill-list">
      {(Object.keys(skillLabels) as (keyof BalletSkills)[]).map((key) => {
        const value = Math.max(0, Math.min(100, skills[key]));
        return (
          <div className="domain-skill-row" key={key}>
            <div className="domain-skill-label"><span>{skillLabels[key]}</span><span>{value}</span></div>
            <div className="skill-meter" role="meter" aria-label={skillLabels[key]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
              <span style={{ width: `${value}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  </article>
);

export const TrainingStatusCard: React.FC<{ statuses: readonly TrainingStatus[] }> = ({ statuses }) => (
  <article className="read-model-card">
    <div className="read-model-card-heading">
      <div>
        <span className="profile-card-label">BALLET ACTIVITIES</span>
        <h2>Training status</h2>
      </div>
    </div>
    {statuses.length === 0 ? (
      <p className="read-model-empty">No activity status is included in this profile snapshot.</p>
    ) : (
      <ul className="read-model-status-list">
        {statuses.map((status) => (
          <li key={status.activityCode}>
            <span>{status.displayName}</span>
            <span className={`activity-status activity-status-${status.availability.toLowerCase()}`}>
              {activityStatusLabel(status)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </article>
);

export const AssessmentHistoryCard: React.FC<{ assessments: readonly AssessmentSummary[] }> = ({ assessments }) => (
  <article className="read-model-card">
    <div className="read-model-card-heading">
      <div>
        <span className="profile-card-label">PERFORMANCE RECORDS</span>
        <h2>Assessment history</h2>
      </div>
    </div>
    {assessments.length === 0 ? (
      <p className="read-model-empty">No completed performance results are included in this preview.</p>
    ) : (
      <ul className="assessment-list">
        {assessments.map((assessment) => (
          <li key={`${assessment.performanceId}-${assessment.completedAt.toISOString()}`}>
            <span><strong>{assessment.displayName}</strong><small>{formatDate(assessment.completedAt)}</small></span>
            <span className={`assessment-tier assessment-tier-${assessment.tier.toLowerCase()}`}>
              {assessment.tier} · {assessment.score}
            </span>
          </li>
        ))}
      </ul>
    )}
  </article>
);

export const WardrobeReadModelCard: React.FC<{ wardrobe: WardrobeSummary }> = ({ wardrobe }) => {
  const layerMap = mapOutfitToAvatarLayers(wardrobe.equippedOutfit);
  const mappedLayerCount = Object.values(layerMap).filter((items) => items.length > 0).length;
  return (
    <article className="read-model-card wardrobe-read-model-card">
      <div className="read-model-card-heading">
        <div>
          <span className="profile-card-label">EQUIPPED WARDROBE</span>
          <h2>{wardrobe.equippedOutfit.length ? `${wardrobe.equippedOutfit.length} pieces equipped` : "No equipped pieces"}</h2>
        </div>
        <span className={`uniform-status ${wardrobe.academyUniform.ready ? "uniform-ready" : "uniform-incomplete"}`}>
          {wardrobe.academyUniform.ready ? "Uniform ready" : "Uniform incomplete"}
        </span>
      </div>
      {wardrobe.equippedOutfit.length > 0 ? (
        <ul className="wardrobe-item-list">
          {wardrobe.equippedOutfit.map((item) => (
            <li key={item.itemId}>
              <strong>{item.displayName}</strong>
              <span>{item.slots.join(" · ")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="read-model-empty">No equipped items are included in this profile snapshot.</p>
      )}
      <p className="wardrobe-layer-note">
        {mappedLayerCount} avatar layer{mappedLayerCount === 1 ? "" : "s"} can be mapped from these equipment slots.
      </p>
      <ul className="uniform-piece-list">
        {wardrobe.academyUniform.pieces.map((piece) => (
          <li key={piece.slot}>
            <span>{piece.label}</span>
            <span>{piece.satisfied ? piece.equippedItemName : "Not equipped"}</span>
          </li>
        ))}
      </ul>
    </article>
  );
};

export const AcademyProfileSummary: React.FC<{ profile: AcademyProfile }> = ({ profile }) => (
  <>
    <AcademyStageCard progress={profile.academy} />
    <BalletSkillsCard skills={profile.skills} progression={profile.ballet} />
    <TrainingStatusCard statuses={profile.trainingStatuses} />
    <AssessmentHistoryCard assessments={profile.assessments} />
    <WardrobeReadModelCard wardrobe={profile.wardrobe} />
  </>
);

function activityStatusLabel(status: TrainingStatus): string {
  if (status.availability === "COOLDOWN" && status.nextAvailableAt) {
    return `Resting until ${formatDate(status.nextAvailableAt)}`;
  }
  if (status.availability === "LOCKED") return status.lockReason ? `Locked · ${status.lockReason.toLowerCase()}` : "Locked";
  return "Available";
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(value);
}
