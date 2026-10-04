const discordSnowflakePattern = /^\d{17,20}$/;
const DISCORD_EPOCH_MS = 1_420_070_400_000n;

export function assertDiscordSnowflake(value: string, name: string): void {
  if (!discordSnowflakePattern.test(value)) {
    throw new TypeError(`${name} must be a 17- to 20-digit numeric ID.`);
  }
}

/** Read the creation timestamp encoded in a Discord Snowflake without Number precision loss. */
export function discordSnowflakeCreatedAt(value: string): Date {
  assertDiscordSnowflake(value, 'Discord Snowflake');
  const timestamp = (BigInt(value) >> 22n) + DISCORD_EPOCH_MS;
  const milliseconds = Number(timestamp);
  if (!Number.isSafeInteger(milliseconds)) {
    throw new RangeError('Discord Snowflake timestamp is outside the supported date range.');
  }
  return new Date(milliseconds);
}
