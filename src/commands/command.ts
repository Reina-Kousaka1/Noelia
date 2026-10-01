import type Eris from 'eris';

export interface CommandContext {
  readonly client: Eris.Client;
  readonly interaction: Eris.CommandInteraction;
}

export interface SlashCommand {
  readonly definition: Eris.ApplicationCommandCreateOptions<true, 1>;
  execute(context: CommandContext): Promise<void>;
}
