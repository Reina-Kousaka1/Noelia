import * as Eris from 'eris';

import type { SlashCommand } from './command.js';

const chatInput = Eris.Constants.ApplicationCommandTypes.CHAT_INPUT;

export type CommandSyncAction = 'created' | 'updated' | 'deleted' | 'unchanged';
export type CommandSyncScope = 'guild' | 'global';
export type CommandSyncObserver = (
  action: CommandSyncAction,
  scope: CommandSyncScope,
  name: string,
) => void;

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

// Fetched commands contain IDs, versions and default values. Compare only the registry-owned
// schema so a second synchronization does not issue needless PATCH requests.
function normalizeOption(option: Eris.ApplicationCommandOptions): unknown {
  const value = option as unknown as Record<string, unknown>;
  const result: Record<string, unknown> = {
    name: value.name,
    description: value.description,
    type: value.type,
  };

  if (value.required === true) result.required = true;
  if (value.autocomplete === true) result.autocomplete = true;

  for (const key of ['min_value', 'max_value', 'channel_types']) {
    if (value[key] !== undefined && value[key] !== null) result[key] = value[key];
  }

  for (const key of ['nameLocalizations', 'descriptionLocalizations']) {
    if (value[key] != null && Object.keys(value[key] as object).length > 0) {
      result[key] = value[key];
    }
  }

  if (Array.isArray(value.choices) && value.choices.length > 0) {
    result.choices = value.choices.map((choice: { name: string; value: string | number }) => ({
      name: choice.name,
      value: choice.value,
    }));
  }

  if (Array.isArray(value.options) && value.options.length > 0) {
    result.options = value.options.map((nested: Eris.ApplicationCommandOptions) =>
      normalizeOption(nested),
    );
  }

  return result;
}

function normalizeCommand(
  command: Eris.ApplicationCommandCreateOptions<true, 1> | Eris.ApplicationCommand<true>,
): unknown {
  return {
    name: command.name,
    description: command.description,
    type: command.type ?? chatInput,
    options: (command.options ?? []).map(normalizeOption),
    nsfw: command.nsfw ?? false,
    nameLocalizations: command.nameLocalizations ?? null,
    descriptionLocalizations: command.descriptionLocalizations ?? null,
  };
}

export async function synchronizeGuildCommands(
  client: Eris.Client,
  guildId: string,
  registry: CommandRegistry,
  observe: CommandSyncObserver = () => {},
): Promise<void> {
  const existingCommands = await client.getGuildCommands(guildId);
  const desiredNames = new Set(registry.list().map((command) => command.definition.name));
  const kept = new Map<string, Eris.ApplicationCommand<true>>();

  // Delete stale commands and duplicate definitions before creating missing commands.
  for (const existing of [...existingCommands].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (
      existing.type !== chatInput ||
      !desiredNames.has(existing.name) ||
      kept.has(existing.name)
    ) {
      await client.deleteGuildCommand(guildId, existing.id);
      observe('deleted', 'guild', existing.name);
    } else {
      kept.set(existing.name, existing);
    }
  }

  for (const command of registry.list()) {
    const existing = kept.get(command.definition.name);

    if (existing === undefined) {
      await client.createGuildCommand(guildId, command.definition);
      observe('created', 'guild', command.definition.name);
    } else if (
      JSON.stringify(normalizeCommand(existing)) !==
      JSON.stringify(normalizeCommand(command.definition))
    ) {
      await client.editGuildCommand(guildId, existing.id, command.definition);
      observe('updated', 'guild', command.definition.name);
    } else {
      observe('unchanged', 'guild', command.definition.name);
    }
  }
}

export async function synchronizeApplicationCommands(
  client: Eris.Client,
  guildId: string,
  registry: CommandRegistry,
  observe: CommandSyncObserver = () => {},
): Promise<void> {
  // During development the registry is guild-scoped. First ensure those commands are
  // available, then remove the old global catalog that can shadow them in the guild.
  await synchronizeGuildCommands(client, guildId, registry, observe);

  const globalCommands = await client.getCommands();

  for (const command of [...globalCommands].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    await client.deleteCommand(command.id);
    observe('deleted', 'global', command.name);
  }
}
