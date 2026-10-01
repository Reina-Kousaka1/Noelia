import type Eris from 'eris';
import type { DailyClaimResult } from '../economy/types.js';

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
}

export interface SlashCommand {
  readonly definition: Eris.ApplicationCommandCreateOptions<true, 1>;
  execute(context: CommandContext): Promise<void>;
}
