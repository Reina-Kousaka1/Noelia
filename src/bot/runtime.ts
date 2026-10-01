import * as Eris from 'eris';
import type { Pool } from 'pg';

import type { AppConfig } from '../config/environment.js';
import { EconomyService } from '../economy/economy-service.js';
import { DailyService } from '../economy/daily-service.js';
import { BalletService } from '../ballet/ballet-service.js';
import { ShopService } from '../shop/shop-service.js';
import { InventoryService } from '../inventory/inventory-service.js';
import { WardrobeService } from '../wardrobe/wardrobe-service.js';
import { ProfileService } from '../profile/profile-service.js';
import { PersonaPresenceRotator } from '../persona/presence-rotator.js';
import { balanceCommand } from '../commands/balance/balance.command.js';
import { balletCommand } from '../commands/ballet/ballet.command.js';
import { dailyCommand } from '../commands/daily/daily.command.js';
import { shopCommand } from '../commands/shop/shop.command.js';
import { inventoryCommand } from '../commands/inventory/inventory.command.js';
import { wardrobeCommand } from '../commands/wardrobe/wardrobe.command.js';
import { profileCommand } from '../commands/profile/profile.command.js';
import { pingCommand } from '../commands/ping/ping.command.js';
import { createHelpCommand } from '../commands/help/help.command.js';
import { CommandRegistry, synchronizeGuildCommands } from '../commands/registry.js';
import { InteractionRouter } from '../interactions/interaction-router.js';
import type { StructuredLogger } from '../infrastructure/logging/logger.js';

export interface DiscordRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type ErisClientFactory = (token: string, options: Eris.ClientOptions) => Eris.Client;

export function createDiscordRuntime(
  config: AppConfig,
  logger: StructuredLogger,
  pool: Pool,
  createClient: ErisClientFactory = (token, options) => new Eris.Client(token, options),
): DiscordRuntime {
  const client = createClient(config.discord.token, {
    intents: ['guilds'],
    autoreconnect: true,
  });
  const presence = new PersonaPresenceRotator(client, (error) => {
    logger.error('discord.presence_update_failed', error);
  });
  const economy = new EconomyService(pool);
  const daily = new DailyService(pool, economy);
  const ballet = new BalletService(pool, economy);
  const shop = new ShopService(pool, economy);
  const inventory = new InventoryService(pool);
  const wardrobe = new WardrobeService(pool);
  const profile = new ProfileService(economy, ballet, wardrobe);
  const coreCommands = [
    pingCommand,
    balanceCommand,
    dailyCommand,
    balletCommand,
    shopCommand,
    inventoryCommand,
    wardrobeCommand,
    profileCommand,
  ];
  const registry = new CommandRegistry([...coreCommands, createHelpCommand(coreCommands)]);
  const router = new InteractionRouter(registry, logger, {
    economy,
    daily,
    ballet,
    shop,
    inventory,
    wardrobe,
    profile,
  });
  let stopping = false;

  client.on('ready', () => {
    presence.start();
    logger.info('discord.ready', {
      botUsername: client.user.username,
    });

    void synchronizeGuildCommands(client, config.discord.guildId, registry)
      .then(() => {
        logger.info('discord.commands.synchronized', {
          count: registry.list().length,
          scope: 'guild',
        });
      })
      .catch((error: unknown) => {
        logger.error('discord.commands.synchronization_failed', error, {
          scope: 'guild',
        });
      });
  });

  client.on('interactionCreate', (interaction: Eris.AnyInteraction | Eris.UnknownInteraction) => {
    if (interaction instanceof Eris.CommandInteraction) {
      void router.dispatch(interaction, client).catch((error: unknown) => {
        logger.error('discord.interaction_dispatch_failed', error, {
          interactionId: interaction.id,
        });
      });
    }
  });

  client.on('error', (error: Error) => {
    logger.error('discord.client_error', error);
  });

  client.on('warn', (message: string) => {
    logger.warn('discord.client_warning', { message });
  });

  client.on('disconnect', () => {
    if (!stopping) {
      logger.warn('discord.disconnected');
    }
  });

  return {
    async start() {
      logger.info('discord.connecting');

      try {
        await client.connect();
      } catch (error) {
        presence.stop();
        client.disconnect({ reconnect: false });
        throw error;
      }
    },
    async stop() {
      if (stopping) {
        return;
      }

      stopping = true;
      logger.info('discord.disconnecting');
      presence.stop();
      client.disconnect({ reconnect: false });
    },
  };
}
