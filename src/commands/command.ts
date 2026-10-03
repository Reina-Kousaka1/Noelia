import type Eris from 'eris';
import type { BalletProgressPort } from '../ballet/types.js';
import type { BalletAcademyPort } from '../ballet/academy-service.js';
import type { DailyClaimResult } from '../economy/types.js';
import type { ShopPort } from '../shop/types.js';
import type { InventoryPort } from '../inventory/types.js';
import type { WardrobePort } from '../wardrobe/types.js';
import type { ProfilePort } from '../profile/types.js';
import type { MarketplacePort } from '../marketplace/types.js';
import type { PerformancePort } from '../performance/types.js';
import type { CollectionPort } from '../collections/types.js';
import type { WardrobePresetPort } from '../wardrobe/types.js';
import type { AchievementPort } from '../achievements/types.js';
import type { PersonaTextPort } from '../persona/generator.js';
import type { RelationshipPort } from '../relationships/types.js';
import type { ModerationPort } from '../moderation/moderation-types.js';
import type { AutomodPort } from '../automod/types.js';
import type { KnowledgePort } from '../knowledge/types.js';
import type { BalletClassPort } from '../ballet/class/types.js';

export interface CommandContext {
  readonly client: Eris.Client;
  readonly interaction: Eris.CommandInteraction;
  readonly services: CommandServices;
}

export interface EconomyQueryPort {
  getBalance(discordUserId: string): Promise<bigint>;
}

export interface DailyClaimPort {
  claimDaily(interactionId: string, discordUserId: string): Promise<DailyClaimResult>;
}

export interface CommandServices {
  readonly economy: EconomyQueryPort;
  readonly daily: DailyClaimPort;
  readonly ballet: BalletProgressPort;
  readonly balletClass?: BalletClassPort;
  readonly academy?: BalletAcademyPort;
  readonly shop: ShopPort;
  readonly inventory: InventoryPort;
  readonly wardrobe: WardrobePort;
  readonly profile: ProfilePort;
  readonly marketplace?: MarketplacePort;
  readonly performances?: PerformancePort;
  readonly collections?: CollectionPort;
  readonly wardrobePresets?: WardrobePresetPort;
  readonly achievements?: AchievementPort;
  readonly persona?: PersonaTextPort;
  readonly relationships?: RelationshipPort;
  readonly moderation?: ModerationPort;
  readonly automod?: AutomodPort;
  readonly knowledge?: KnowledgePort;
  readonly automodRuntime?: {
    readonly messageScanningEnabled: boolean;
    readonly joinMonitoringEnabled: boolean;
  };
}

export interface SlashCommand {
  readonly definition: Eris.ApplicationCommandCreateOptions<true, 1>;
  execute(context: CommandContext): Promise<void>;
}
