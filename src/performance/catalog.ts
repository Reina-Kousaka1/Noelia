export const BALLET_PERFORMANCE_IDS = [
  'spring-recital',
  'moonlit-showcase',
  'prima-audition',
] as const;

export type BalletPerformanceId = (typeof BALLET_PERFORMANCE_IDS)[number];
