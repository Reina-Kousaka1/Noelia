import type Eris from 'eris';

export interface CommandContext {
  readonly client: Eris.Client;
  readonly interaction: Eris.CommandInteraction;
  readonly services: CommandServices;
}

export interface EconomyQueryPort {
  getBalance(discordUserId: string): Promise<bigint>;
}

export interface CommandServices {
  readonly economy: EconomyQueryPort;
}

export interface SlashCommand {
  readonly definition: Eris.ApplicationCommandCreateOptions<true, 1>;
  execute(context: CommandContext): Promise<void>;
}
