const discordSnowflakePattern = /^\d{17,20}$/;

export function assertDiscordSnowflake(value: string, name: string): void {
  if (!discordSnowflakePattern.test(value)) {
    throw new TypeError(`${name} must be a 17- to 20-digit numeric ID.`);
  }
}
