export const BALLET_ACTIVITY_CODES = [
  'class',
  'barre',
  'center-practice',
  'stretching',
  'technique',
  'pointe-practice',
] as const;

export type BalletActivityCode = (typeof BALLET_ACTIVITY_CODES)[number];
