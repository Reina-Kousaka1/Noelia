import type Eris from 'eris';
import type { BalletProgressPort } from '../ballet/types.js';
import type { DailyClaimResult } from '../economy/types.js';
import type { ShopPort } from '../shop/types.js';
import type { InventoryPort } from '../inventory/types.js';
import type { WardrobePort } from '../wardrobe/types.js';
import type { ProfilePort } from '../profile/types.js';
import type { MarketplacePort } from '../marketplace/types.js';
import type { PerformancePort } from '../performance/types.js';

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
  readonly shop: ShopPort;
  readonly inventory: InventoryPort;
  readonly wardrobe: WardrobePort;
  readonly profile: ProfilePort;
  readonly marketplace?: MarketplacePort;
  readonly performances?: PerformancePort;
}

export interface SlashCommand {
  readonly definition: Eris.ApplicationCommandCreateOptions<true, 1>;
  execute(context: CommandContext): Promise<void>;
}
