import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import type { BalletProgressPort } from '../ballet/types.js';
import type { AchievementPort } from '../achievements/types.js';
import type { CollectionPort } from '../collections/types.js';
import type { WardrobePort } from '../wardrobe/types.js';
import type { ProfilePort, ProfileSummary } from './types.js';

export interface ProfileWalletPort {
  getBalance(discordUserId: string): Promise<bigint>;
}

export type ProfileBalletPort = Pick<BalletProgressPort, 'getProgress'>;
export type ProfileWardrobePort = Pick<WardrobePort, 'getOutfit'>;
export type ProfileCollectionPort = Pick<CollectionPort, 'listProgress'>;
export type ProfileAchievementPort = Pick<AchievementPort, 'getFeatured'>;

export class ProfileService implements ProfilePort {
  public constructor(
    private readonly wallet: ProfileWalletPort,
    private readonly ballet: ProfileBalletPort,
    private readonly wardrobe: ProfileWardrobePort,
    private readonly collections: ProfileCollectionPort,
    private readonly achievements: ProfileAchievementPort,
  ) {}

  public async getProfile(discordUserId: string): Promise<ProfileSummary> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');

    const [balletSlippers, ballet, outfit, collections, featuredAchievement] = await Promise.all([
      this.wallet.getBalance(discordUserId),
      this.ballet.getProgress(discordUserId),
      this.wardrobe.getOutfit(discordUserId),
      this.collections.listProgress(discordUserId),
      this.achievements.getFeatured(discordUserId),
    ]);

    return {
      balletSlippers,
      ballet,
      outfit,
      completedCollections: collections.filter((collection) => collection.complete).length,
      totalCollections: collections.length,
      featuredAchievement,
    };
  }
}
