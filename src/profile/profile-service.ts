import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import type { BalletProgressPort } from '../ballet/types.js';
import type { WardrobePort } from '../wardrobe/types.js';
import type { ProfilePort, ProfileSummary } from './types.js';

export interface ProfileWalletPort {
  getBalance(discordUserId: string): Promise<bigint>;
}

export type ProfileBalletPort = Pick<BalletProgressPort, 'getProgress'>;
export type ProfileWardrobePort = Pick<WardrobePort, 'getOutfit'>;

export class ProfileService implements ProfilePort {
  public constructor(
    private readonly wallet: ProfileWalletPort,
    private readonly ballet: ProfileBalletPort,
    private readonly wardrobe: ProfileWardrobePort,
  ) {}

  public async getProfile(discordUserId: string): Promise<ProfileSummary> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');

    const [balletSlippers, ballet, outfit] = await Promise.all([
      this.wallet.getBalance(discordUserId),
      this.ballet.getProgress(discordUserId),
      this.wardrobe.getOutfit(discordUserId),
    ]);

    return { balletSlippers, ballet, outfit };
  }
}
