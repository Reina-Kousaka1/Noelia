import type { AcademyProfile } from "../domain/academyProfile";
import type { AcademyProfileSource } from "./academyProfileSource";

/** Display-only values for the Root prototype. They are never persisted. */
const developmentProfilePreview: AcademyProfile = {
  academy: {
    currentStage: {
      id: "student",
      title: "Studio Student",
      description: "Your Ballet journey begins with the next class.",
      requirements: [],
    },
    nextStage: {
      id: "apprentice",
      title: "Academy Apprentice",
      description: "Build a steady studio foundation across several kinds of class.",
      requirements: [
        { label: "Reach Ballet level 5", met: false },
        { label: "Complete 4 different Ballet activities", met: false },
        { label: "Technique 6+", met: false },
      ],
    },
    completedStageCount: 0,
  },
  ballet: {
    totalXp: 0n,
    level: 1,
    xpToNextLevel: 100n,
  },
  skills: {
    technique: 0,
    flexibility: 0,
    musicality: 0,
    performance: 0,
    pointe: 0,
    stamina: 0,
  },
  trainingStatuses: [
    {
      activityCode: "class",
      displayName: "Class",
      minimumLevel: 1,
      availability: "AVAILABLE",
      lockReason: null,
      nextAvailableAt: null,
    },
    {
      activityCode: "barre",
      displayName: "Barre",
      minimumLevel: 1,
      availability: "AVAILABLE",
      lockReason: null,
      nextAvailableAt: null,
    },
  ],
  assessments: [],
  wardrobe: {
    equippedOutfit: [],
    academyUniform: {
      rankTitle: "Studio Student",
      balletLevel: 1,
      ready: false,
      pointeRequired: false,
      pieces: [
        {
          slot: "leotard",
          label: "Leotard",
          satisfied: false,
          equippedItemName: null,
          ownedAlternatives: [],
          availableAlternatives: [],
        },
        {
          slot: "tights",
          label: "Ballet tights",
          satisfied: false,
          equippedItemName: null,
          ownedAlternatives: [],
          availableAlternatives: [],
        },
        {
          slot: "shoes",
          label: "Ballet flats",
          satisfied: false,
          equippedItemName: null,
          ownedAlternatives: [],
          availableAlternatives: [],
        },
      ],
    },
  },
};

export const devProfileDataLabel = "LOCAL DEVELOPMENT PREVIEW · NOT CONNECTED TO NOÉLIA MAIN";

export const devProfileSource: AcademyProfileSource = {
  async loadProfile() {
    return developmentProfilePreview;
  },
};
