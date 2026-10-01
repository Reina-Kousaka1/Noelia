import type { BalletProgressStatus } from '../ballet/types.js';
import type { WardrobeOutfitItem } from '../wardrobe/types.js';

export interface ProfileSummary {
  readonly balletSlippers: bigint;
  readonly ballet: BalletProgressStatus;
  readonly outfit: readonly WardrobeOutfitItem[];
}

export interface ProfilePort {
  getProfile(discordUserId: string): Promise<ProfileSummary>;
}
