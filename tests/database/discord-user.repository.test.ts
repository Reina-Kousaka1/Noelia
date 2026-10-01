import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PostgresDiscordUserRepository } from '../../src/database/discord-user.repository.js';

describe('PostgresDiscordUserRepository', () => {
  it('uses bound parameters for Discord IDs and returns the stored identity', async () => {
    const discordUserId = '123456789012345678';
    const user = { discordUserId, createdAt: new Date('2026-09-01T00:00:00.000Z') };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [user], rowCount: 1 });
    const pool = { query } as unknown as Pool;
    const repository = new PostgresDiscordUserRepository(pool);

    await expect(repository.findOrCreate(discordUserId)).resolves.toEqual(user);

    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('VALUES ($1)'), [
      discordUserId,
    ]);
    expect(query.mock.calls[0]?.[0]).not.toContain(discordUserId);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE discord_user_id = $1'),
      [discordUserId],
    );
  });

  it('rejects malformed IDs before querying PostgreSQL', async () => {
    const query = vi.fn();
    const repository = new PostgresDiscordUserRepository({ query } as unknown as Pool);

    await expect(repository.findOrCreate('not-a-discord-id')).rejects.toThrow(
      'Discord user ID must be a 17- to 20-digit numeric ID.',
    );
    expect(query).not.toHaveBeenCalled();
  });
});
