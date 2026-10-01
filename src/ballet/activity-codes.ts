export const BALLET_ACTIVITY_CODES = [
  'class',
  'barre',
  'center-practice',
  'stretching',
  'technique',
  'pointe-practice',
  'rehearsal',
  'choreography',
  'performance',
  'audition',
  'recital',
  'showcase',
] as const;

export type BalletActivityCode = (typeof BALLET_ACTIVITY_CODES)[number];
