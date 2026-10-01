export const BALLET_XP_PER_LEVEL = 100n;
export const MAX_BALLET_LEVEL = 100;

export function getBalletLevel(totalXp: bigint): number {
  if (totalXp < 0n) {
    throw new RangeError('Total Ballet XP cannot be negative.');
  }

  const calculatedLevel = totalXp / BALLET_XP_PER_LEVEL + 1n;
  return Number(
    calculatedLevel > BigInt(MAX_BALLET_LEVEL) ? BigInt(MAX_BALLET_LEVEL) : calculatedLevel,
  );
}

export function getXpToNextLevel(totalXp: bigint): bigint | null {
  const level = getBalletLevel(totalXp);

  if (level === MAX_BALLET_LEVEL) {
    return null;
  }

  const xpInLevel = totalXp % BALLET_XP_PER_LEVEL;
  return BALLET_XP_PER_LEVEL - xpInLevel;
}
