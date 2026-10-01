import type { BalletStatKey } from '../ballet/types.js';

export type PerformanceTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PRIMA';
export type PerformanceAvailability = 'AVAILABLE' | 'LOCKED' | 'COOLDOWN';
export type PerformanceLockReason = 'LEVEL' | 'STATS' | 'EQUIPMENT' | 'ACTIVITY';

export interface PerformanceStatRequirement {
  readonly key: BalletStatKey;
  readonly minimum: number;
  readonly weight: number;
}

export interface BalletPerformanceView {
  readonly performanceId: string;
  readonly displayName: string;
  readonly description: string;
  readonly minimumLevel: number;
  readonly xpReward: bigint;
  readonly slippersReward: bigint;
  readonly requirements: readonly PerformanceStatRequirement[];
  readonly requiredEquippedItemId: string | null;
  readonly requiredActivityCode: string | null;
  readonly availability: PerformanceAvailability;
  readonly lockReason: PerformanceLockReason | null;
  readonly nextAvailableAt: Date | null;
}

export interface BalletPerformanceResult {
  readonly performanceId: string;
  readonly displayName: string;
  readonly score: number;
  readonly tier: PerformanceTier;
  readonly xpAwarded: bigint;
  readonly slippersAwarded: bigint;
  readonly totalXp: bigint;
  readonly level: number;
  readonly walletBalance: bigint;
  readonly completedAt: Date;
  readonly nextAvailableAt: Date;
  readonly replayed: boolean;
}

export interface BalletPerformanceHistoryPage {
  readonly entries: readonly BalletPerformanceResult[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalEntries: number;
  readonly totalPages: number;
}

export interface PerformancePort {
  listPerformances(discordUserId: string): Promise<readonly BalletPerformanceView[]>;
  perform(
    interactionId: string,
    discordUserId: string,
    performanceId: string,
  ): Promise<BalletPerformanceResult>;
  listHistory(discordUserId: string, page: number): Promise<BalletPerformanceHistoryPage>;
}
