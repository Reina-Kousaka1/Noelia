import type { BalletProgressStatus } from '../ballet/types.js';
import type { FeaturedAchievement } from '../achievements/types.js';
import type { WardrobeOutfitItem } from '../wardrobe/types.js';
import type { MarriageSummary } from '../relationships/types.js';
import type { BalletAcademyProgress } from '../ballet/academy.js';

export interface ProfileSummary {
  readonly balletSlippers: bigint;
  readonly ballet: BalletProgressStatus;
  readonly outfit: readonly WardrobeOutfitItem[];
  readonly completedCollections: number;
  readonly totalCollections: number;
  readonly featuredAchievement: FeaturedAchievement | null;
  readonly marriage: MarriageSummary | null;
  readonly academy: BalletAcademyProgress;
}

export interface ProfilePort {
  getProfile(discordUserId: string): Promise<ProfileSummary>;
}
