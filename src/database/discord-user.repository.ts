import type { Pool } from 'pg';

export interface DiscordUser {
  readonly discordUserId: string;
  readonly createdAt: Date;
}

interface DiscordUserRow {
  readonly discordUserId: string;
  readonly createdAt: Date;
}

export class PostgresDiscordUserRepository {
  public constructor(private readonly pool: Pool) {}

  public async findOrCreate(discordUserId: string): Promise<DiscordUser> {
    if (!/^\d{17,20}$/.test(discordUserId)) {
      throw new TypeError('Discord user ID must be a 17- to 20-digit numeric ID.');
    }

    await this.pool.query(
      `INSERT INTO discord_users (discord_user_id)
       VALUES ($1)
       ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );

    const result = await this.pool.query<DiscordUserRow>(
      `SELECT discord_user_id AS "discordUserId", created_at AS "createdAt"
       FROM discord_users
       WHERE discord_user_id = $1`,
      [discordUserId],
    );
    const user = result.rows[0];

    if (user === undefined) {
      throw new Error('Discord user record could not be loaded after insert.');
    }

    return user;
  }
}
