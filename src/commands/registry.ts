import * as Eris from 'eris';

import type { SlashCommand } from './command.js';

export class CommandRegistry {
  private readonly commandsByName: ReadonlyMap<string, SlashCommand>;

  public constructor(commands: readonly SlashCommand[]) {
    const commandsByName = new Map<string, SlashCommand>();

    for (const command of commands) {
      const name = command.definition.name;

      if (commandsByName.has(name)) {
        throw new Error(`Duplicate slash command definition: ${name}`);
      }

      commandsByName.set(name, command);
    }

    this.commandsByName = commandsByName;
  }

  public get(name: string): SlashCommand | undefined {
    return this.commandsByName.get(name);
  }

  public list(): readonly SlashCommand[] {
    return [...this.commandsByName.values()];
  }
}

export async function synchronizeGuildCommands(
  client: Eris.Client,
  guildId: string,
  registry: CommandRegistry,
): Promise<void> {
  const existingCommands = await client.getGuildCommands(guildId);

  for (const command of registry.list()) {
    const existing = existingCommands.find(
      (candidate) =>
        candidate.name === command.definition.name &&
        candidate.type === Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    );

    if (existing === undefined) {
      await client.createGuildCommand(guildId, command.definition);
      continue;
    }

    await client.editGuildCommand(guildId, existing.id, command.definition);
  }
}
