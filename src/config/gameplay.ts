export const GAMEPLAY_CONFIG = {
  dailyRewardAmount: 100n,
  dailyCooldownMs: 24 * 60 * 60 * 1_000,
  academySchedule: {
    minimumLeadMs: 30 * 60 * 1_000,
    maximumLeadMs: 90 * 24 * 60 * 60 * 1_000,
    checkInBeforeMs: 15 * 60 * 1_000,
    checkInAfterMs: 15 * 60 * 1_000,
    delayedDeliveryGraceMs: 15 * 60 * 1_000,
    cancellationCutoffMs: 60 * 60 * 1_000,
    schedulerHeartbeatToleranceMs: 45 * 1_000,
    maxDuePerTick: 100,
  },
} as const;
