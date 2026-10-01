import type { BalletActivityCode } from './activity-codes.js';

export interface BalletProgressStatus {
  readonly totalXp: bigint;
  readonly level: number;
  readonly xpToNextLevel: bigint | null;
  readonly stats: BalletStats;
}

export const BALLET_STAT_KEYS = [
  'technique',
  'flexibility',
  'musicality',
  'performance',
  'pointe',
  'stamina',
] as const;

export type BalletStatKey = (typeof BALLET_STAT_KEYS)[number];

export type BalletStats = Readonly<Record<BalletStatKey, number>>;

export interface BalletStatSnapshot {
  readonly key: BalletStatKey;
  readonly gain: number;
  readonly value: number;
}

export type BalletActivityAvailability = 'AVAILABLE' | 'LOCKED' | 'COOLDOWN';

export interface BalletActivityView {
  readonly code: BalletActivityCode;
  readonly displayName: string;
  readonly description: string;
  readonly category: string;
  readonly minimumLevel: number;
  readonly xpReward: bigint;
  readonly slippersReward: bigint;
  readonly statKey: BalletStatKey;
  readonly statGain: number;
  readonly requirementMet: boolean;
  readonly requiredEquippedItemId: string | null;
  readonly requiredActivityCode: BalletActivityCode | null;
  readonly lockReason: 'LEVEL' | 'REQUIREMENT' | null;
  readonly availability: BalletActivityAvailability;
  readonly nextAvailableAt: Date | null;
}

export interface BalletPracticeResult {
  readonly activityCode: BalletActivityCode;
  readonly displayName: string;
  readonly xpAwarded: bigint;
  readonly slippersAwarded: bigint;
  readonly stat: BalletStatSnapshot | null;
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
