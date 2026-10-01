import type { BalletActivityCode } from './activity-codes.js';

export interface BalletProgressStatus {
  readonly totalXp: bigint;
  readonly level: number;
  readonly xpToNextLevel: bigint | null;
}

export type BalletActivityAvailability = 'AVAILABLE' | 'LOCKED' | 'COOLDOWN';

export interface BalletActivityView {
  readonly code: BalletActivityCode;
  readonly displayName: string;
  readonly minimumLevel: number;
  readonly xpReward: bigint;
  readonly slippersReward: bigint;
  readonly availability: BalletActivityAvailability;
  readonly nextAvailableAt: Date | null;
}

export interface BalletPracticeResult {
  readonly activityCode: BalletActivityCode;
  readonly displayName: string;
  readonly xpAwarded: bigint;
  readonly slippersAwarded: bigint;
  readonly totalXp: bigint;
  readonly level: number;
  readonly nextLevelXp: bigint | null;
  readonly nextAvailableAt: Date;
  readonly walletBalance: bigint;
  readonly replayed: boolean;
}

export interface BalletProgressPort {
  getProgress(discordUserId: string): Promise<BalletProgressStatus>;
  listActivities(discordUserId: string): Promise<readonly BalletActivityView[]>;
  practice(
    interactionId: string,
    discordUserId: string,
    activityCode: string,
  ): Promise<BalletPracticeResult>;
}
