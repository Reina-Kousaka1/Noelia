import { describe, expect, it } from 'vitest';

import { discordSnowflakeCreatedAt } from '../../src/utils/discord-snowflake.js';

const discordEpochMs = 1_420_070_400_000n;

function snowflakeAt(date: Date): string {
  return (((BigInt(date.getTime()) - discordEpochMs) << 22n) | 1n).toString();
}

describe('Discord Snowflake timestamps', () => {
  it('recovers the exact interaction creation time without floating-point parsing', () => {
    const createdAt = new Date('2026-10-05T12:34:56.789Z');
    expect(discordSnowflakeCreatedAt(snowflakeAt(createdAt))).toEqual(createdAt);
  });

  it('rejects malformed identifiers before interpreting their timestamp', () => {
    expect(() => discordSnowflakeCreatedAt('not-a-snowflake')).toThrow('17- to 20-digit');
  });
});
