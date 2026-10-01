export const ACHIEVEMENT_IDS = [
  'first-steps',
  'ballet-level-ten',
  'first-performance',
  'spotlight-moment',
  'first-boutique-piece',
  'first-studio-look',
  'first-market-sale',
  'first-market-purchase',
  'first-collection',
  'three-collections',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface AchievementSummary {
  readonly achievementId: AchievementId;
  readonly displayName: string;
  readonly description: string;
  readonly badgeMark: string;
  readonly unlockedAt: Date | null;
  readonly featured: boolean;
}

export type FeaturedAchievement = Pick<
  AchievementSummary,
  'achievementId' | 'displayName' | 'description' | 'badgeMark'
>;

export interface AchievementFeatureResult {
  readonly achievement: FeaturedAchievement | null;
  readonly replayed: boolean;
}

export interface AchievementPort {
  list(discordUserId: string): Promise<readonly AchievementSummary[]>;
  getFeatured(discordUserId: string): Promise<FeaturedAchievement | null>;
  feature(
    interactionId: string,
    discordUserId: string,
    achievementId: string,
  ): Promise<AchievementFeatureResult>;
  clearFeatured(interactionId: string, discordUserId: string): Promise<AchievementFeatureResult>;
}
