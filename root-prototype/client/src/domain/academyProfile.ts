/**
 * Root read model mapped from Noélia's existing Ballet, Academy, Performance,
 * Profile, and Wardrobe domain contracts. It contains displayable state only.
 */
export type BalletSkillKey =
  | "technique"
  | "flexibility"
  | "musicality"
  | "performance"
  | "pointe"
  | "stamina";

export type BalletSkills = Readonly<Record<BalletSkillKey, number>>;

export type AcademyStageRequirement = {
  readonly label: string;
  readonly met: boolean;
};

export type AcademyStage = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requirements: readonly AcademyStageRequirement[];
};

export type AcademyStageProgress = {
  readonly currentStage: AcademyStage;
  readonly nextStage: AcademyStage | null;
  readonly completedStageCount: number;
};

export type BalletProgression = {
  readonly totalXp: bigint;
  readonly level: number;
  readonly xpToNextLevel: bigint | null;
};

export type TrainingAvailability = "AVAILABLE" | "LOCKED" | "COOLDOWN";
export type TrainingLockReason = "LEVEL" | "REQUIREMENT" | "STATS" | null;

export type TrainingStatus = {
  readonly activityCode: string;
  readonly displayName: string;
  readonly minimumLevel: number;
  readonly availability: TrainingAvailability;
  readonly lockReason: TrainingLockReason;
  readonly nextAvailableAt: Date | null;
};

export type AssessmentTier = "BRONZE" | "SILVER" | "GOLD" | "PRIMA";

/** A completed ballet performance from the existing Performance domain. */
export type AssessmentSummary = {
  readonly performanceId: string;
  readonly displayName: string;
  readonly score: number;
  readonly tier: AssessmentTier;
  readonly completedAt: Date;
};

export type NoeliaWardrobeSlot =
  | "leotard"
  | "skirt"
  | "wrap"
  | "outerwear"
  | "legwear"
  | "tights"
  | "shoes"
  | "bag"
  | "hair_accessory"
  | "jewelry"
  | "accessory";

export type EquippedOutfit = {
  readonly itemId: string;
  readonly displayName: string;
  readonly slots: readonly NoeliaWardrobeSlot[];
  readonly equippedAt: Date;
};

export type AcademyUniformPiece = {
  readonly slot: "leotard" | "tights" | "shoes";
  readonly label: string;
  readonly satisfied: boolean;
  readonly equippedItemName: string | null;
  readonly ownedAlternatives: readonly string[];
  readonly availableAlternatives: readonly string[];
};

export type WardrobeSummary = {
  readonly equippedOutfit: readonly EquippedOutfit[];
  readonly academyUniform: {
    readonly rankTitle: string;
    readonly balletLevel: number;
    readonly ready: boolean;
    readonly pointeRequired: boolean;
    readonly pieces: readonly AcademyUniformPiece[];
  };
};

/**
 * Supported read-only slice of Noélia's existing profile domains. Attendance,
 * scheduled classes, recovery, enrollment, and report cards are intentionally
 * absent because the inspected main checkout has no corresponding contracts.
 */
export type AcademyProfile = {
  readonly academy: AcademyStageProgress;
  readonly ballet: BalletProgression;
  readonly skills: BalletSkills;
  readonly trainingStatuses: readonly TrainingStatus[];
  readonly assessments: readonly AssessmentSummary[];
  readonly wardrobe: WardrobeSummary;
};
