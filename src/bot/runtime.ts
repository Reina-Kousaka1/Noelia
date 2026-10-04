import * as Eris from 'eris';
import type { Pool } from 'pg';

import type { AppConfig } from '../config/environment.js';
import { EconomyService } from '../economy/economy-service.js';
import { DailyService } from '../economy/daily-service.js';
import { BalletService } from '../ballet/ballet-service.js';
import { BalletAcademyService } from '../ballet/academy-service.js';
import { BalletClassService } from '../ballet/class/class-service.js';
import { AcademyAssessmentService } from '../ballet/assessment/assessment-service.js';
import { BalletTrainingV3Service } from '../ballet/training-v3/training-v3-service.js';
import { ShopService } from '../shop/shop-service.js';
import { InventoryService } from '../inventory/inventory-service.js';
import { WardrobeService } from '../wardrobe/wardrobe-service.js';
import { ProfileService } from '../profile/profile-service.js';
import { PersonaPresenceRotator } from '../persona/presence-rotator.js';
import { balanceCommand } from '../commands/balance/balance.command.js';
import { balletCommand } from '../commands/ballet/ballet.command.js';
import { academyCommand } from '../commands/academy/academy.command.js';
import { dailyCommand } from '../commands/daily/daily.command.js';
import { shopCommand } from '../commands/shop/shop.command.js';
import { inventoryCommand } from '../commands/inventory/inventory.command.js';
import { wardrobeCommand } from '../commands/wardrobe/wardrobe.command.js';
import { profileCommand } from '../commands/profile/profile.command.js';
import { pingCommand } from '../commands/ping/ping.command.js';
import { createHelpCommand } from '../commands/help/help.command.js';
import { marketCommand } from '../commands/market/market.command.js';
import { MarketplaceService } from '../marketplace/marketplace-service.js';
import { PerformanceService } from '../performance/performance-service.js';
import { performanceCommand } from '../commands/performance/performance.command.js';
import { CollectionService } from '../collections/collection-service.js';
import { WardrobePresetService } from '../wardrobe/preset-service.js';
import { AchievementService } from '../achievements/achievement-service.js';
import { achievementsCommand } from '../commands/achievements/achievements.command.js';
import { ChatCompletionsPersonaGenerator } from '../persona/chat-completions-generator.js';
import { SafePersonaPresenter } from '../persona/presentation.js';
import { RelationshipService } from '../relationships/relationship-service.js';
import {
  marryCommand,
  marriageCommand,
  divorceCommand,
} from '../commands/marriage/marriage.command.js';
import { moderationCommands } from '../commands/moderation/moderation.command.js';
import { ModerationService } from '../moderation/moderation-service.js';
import { AutomodService } from '../automod/automod-service.js';
import { AutomodEngine } from '../automod/engine.js';
import { automodCommand } from '../commands/automod/automod.command.js';
import { KnowledgeService } from '../knowledge/knowledge-service.js';
import { learnCommand } from '../commands/learn/learn.command.js';
import { CommandRegistry, synchronizeApplicationCommands } from '../commands/registry.js';
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
  const intents: Eris.IntentStrings[] = ['guilds'];
  if (config.automod.messageScanningEnabled) {
    intents.push('guildMessages', 'messageContent', 'guildMembers');
  }
  if (config.automod.joinMonitoringEnabled && !intents.includes('guildMembers')) {
    intents.push('guildMembers');
  }
  const client = createClient(config.discord.token, {
    intents,
    restMode: true,
    autoreconnect: true,
  });
  const presence = new PersonaPresenceRotator(client, (error) => {
    logger.error('discord.presence_update_failed', error);
  });
  const economy = new EconomyService(pool);
  const daily = new DailyService(pool, economy);
  const balletTrainingV3 = new BalletTrainingV3Service(pool);
  const ballet = new BalletService(pool, economy, balletTrainingV3);
  const academy = new BalletAcademyService(pool);
  const balletClass = new BalletClassService(pool, Math.random, balletTrainingV3);
  const academyAssessment = new AcademyAssessmentService(pool);
  const shop = new ShopService(pool, economy);
  const inventory = new InventoryService(pool);
  const wardrobe = new WardrobeService(pool);
  const marketplace = new MarketplaceService(pool, economy);
  const performances = new PerformanceService(pool, economy);
  const collections = new CollectionService(pool);
  const wardrobePresets = new WardrobePresetService(pool);
  const achievements = new AchievementService(pool);
  const relationships = new RelationshipService(pool);
  const moderation = new ModerationService(pool);
  const automod = new AutomodService(pool);
  const knowledge = new KnowledgeService(pool);
  const automodEngine = new AutomodEngine();
  const profile = new ProfileService(
    economy,
    ballet,
    wardrobe,
    collections,
    achievements,
    relationships,
    academy,
    knowledge,
  );
  const personaGenerator = config.persona.generationEnabled
    ? new ChatCompletionsPersonaGenerator({
        endpoint: config.persona.endpoint!,
        apiKey: config.persona.apiKey!,
        model: config.persona.model!,
      })
    : undefined;
  const persona = new SafePersonaPresenter(
    {
      enabled: config.persona.generationEnabled,
      ...(personaGenerator === undefined ? {} : { generator: personaGenerator }),
      timeoutMs: config.persona.timeoutMs,
      maxConcurrent: config.persona.maxConcurrent,
      maxRequestsPerMinute: config.persona.maxRequestsPerMinute,
    },
    logger,
    Date.now,
    [
      config.discord.token,
      config.postgres.password,
      ...(config.persona.apiKey === undefined ? [] : [config.persona.apiKey]),
    ],
  );
  const coreCommands = [
    pingCommand,
    balanceCommand,
    dailyCommand,
    balletCommand,
    academyCommand,
    shopCommand,
    inventoryCommand,
    wardrobeCommand,
    profileCommand,
    marketCommand,
    performanceCommand,
    achievementsCommand,
    marryCommand,
    marriageCommand,
    divorceCommand,
    automodCommand,
    learnCommand,
  ];
  const commands = [...coreCommands, ...moderationCommands];
  const registry = new CommandRegistry([...commands, createHelpCommand(commands)]);
  const router = new InteractionRouter(registry, logger, {
    economy,
    daily,
    ballet,
    balletClass,
    balletTrainingV3,
    academyAssessment,
    academy,
    shop,
    inventory,
    wardrobe,
    profile,
    marketplace,
    performances,
    collections,
    wardrobePresets,
    achievements,
    persona,
    relationships,
    moderation,
    automod,
    knowledge,
    automodRuntime: {
      messageScanningEnabled: config.automod.messageScanningEnabled,
      joinMonitoringEnabled: config.automod.joinMonitoringEnabled,
    },
  });
  let stopping = false;
  let commandSync: Promise<void> | undefined;
  const automodEventQueues = new Map<string, Promise<void>>();

  const enqueueAutomodEvent = (guildId: string, work: () => Promise<void>): void => {
    const previous = automodEventQueues.get(guildId) ?? Promise.resolve();
    const queued = previous.then(work).catch((error: unknown) => {
      logger.error('automod.event_processing_failed', error, { guildId });
    });
    automodEventQueues.set(guildId, queued);
    void queued.then(() => {
      if (automodEventQueues.get(guildId) === queued) automodEventQueues.delete(guildId);
    });
  };

  const handleDetections = async (
    detections: readonly import('../automod/types.js').AutomodDetection[],
    sourceEventId: string,
  ): Promise<void> => {
    for (const detection of detections) {
      logger.info('automod.rule_detected', {
        guildId: detection.guildId,
        userId: detection.userId,
        rule: detection.rule,
        observed: detection.observed,
        threshold: detection.threshold,
        escalation: detection.escalation,
      });
      if (detection.escalation !== 'CASE') continue;

      const attempt = await moderation.createAttempt({
        idempotencyKey: `automod:${detection.rule}:${sourceEventId}`,
        guildId: detection.guildId,
        actorUserId: client.user.id,
        targetUserId: detection.userId,
        action: 'note',
        source: 'automod',
        reason: `AutoMod detected ${detection.rule} (${detection.observed}/${detection.threshold}).`,
        occurredAt: detection.occurredAt,
      });
      if (attempt.created) {
        await moderation.recordOutcome(attempt.case.caseId, 'SUCCEEDED');
      }
    }
  };

  if (config.automod.messageScanningEnabled) {
    client.on('messageCreate', (message: Eris.Message) => {
      const guildId = message.guildID;
      const member = message.member;
      if (guildId === undefined || message.author.bot || member === null) return;
      enqueueAutomodEvent(guildId, async () => {
        const guildConfig = await automod.getConfig(guildId);
        const memberPermissions = member.permissions;
        const isModerator =
          memberPermissions.has('manageMessages') ||
          memberPermissions.has('moderateMembers') ||
          memberPermissions.has('manageGuild') ||
          memberPermissions.has('kickMembers') ||
          memberPermissions.has('banMembers') ||
          memberPermissions.has('administrator');
        const detections = automodEngine.evaluateMessage(guildConfig, {
          guildId,
          userId: message.author.id,
          content: message.content,
          mentionCount:
            message.mentions.length +
            message.roleMentions.length +
            (message.mentionEveryone ? 1 : 0),
          occurredAt: new Date(message.timestamp),
          isBot: message.author.bot,
          isModerator,
        });
        await handleDetections(detections, message.id);
      });
    });
  }

  if (config.automod.joinMonitoringEnabled) {
    client.on('guildMemberAdd', (guild: Eris.Guild, member: Eris.Member) => {
      const joinedAt = member.joinedAt;
      if (member.bot || joinedAt === null) return;
      enqueueAutomodEvent(guild.id, async () => {
        const guildConfig = await automod.getConfig(guild.id);
        const memberPermissions = member.permissions;
        const isModerator =
          memberPermissions.has('manageMessages') ||
          memberPermissions.has('moderateMembers') ||
          memberPermissions.has('manageGuild') ||
          memberPermissions.has('kickMembers') ||
          memberPermissions.has('banMembers') ||
          memberPermissions.has('administrator');
        const detections = automodEngine.evaluateJoin(guildConfig, {
          guildId: guild.id,
          userId: member.id,
          occurredAt: new Date(joinedAt),
          isBot: member.bot,
          isModerator,
        });
        await handleDetections(detections, `${member.id}:${joinedAt}`);
      });
    });
  }

  client.on('ready', () => {
    presence.start();
    logger.info('discord.ready', {
      botUsername: client.user.username,
    });

    if (commandSync !== undefined || stopping) return;

    commandSync = synchronizeApplicationCommands(
      client,
      config.discord.guildId,
      registry,
      (action, scope, name) => logger.info(`command_sync.${action}`, { scope, name }),
    )
      .then(() => {
        logger.info('discord.commands.synchronized', {
          count: registry.list().length,
          scope: 'guild_and_global',
        });
      })
      .catch((error: unknown) => {
        logger.error('discord.commands.synchronization_failed', error, {
          scope: 'guild_and_global',
        });
      })
      .finally(() => {
        commandSync = undefined;
      });
  });

  client.on('interactionCreate', (interaction: Eris.AnyInteraction | Eris.UnknownInteraction) => {
    if (interaction instanceof Eris.CommandInteraction) {
      void router.dispatch(interaction, client).catch((error: unknown) => {
        logger.error('discord.interaction_dispatch_failed', error, {
          interactionId: interaction.id,
        });
      });
    } else if (interaction instanceof Eris.ComponentInteraction) {
      void router.dispatchComponent(interaction).catch((error: unknown) => {
        logger.error('discord.component_dispatch_failed', error, {
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
