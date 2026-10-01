import * as Eris from 'eris';

import { completeCommand, deferCommand } from '../../interactions/response-policy.js';
import { AutomodConfigurationError } from '../../automod/errors.js';
import { AUTOMOD_RULE_KEYS } from '../../automod/types.js';
import type { AutomodEscalation, AutomodRuleKey } from '../../automod/types.js';
import { ModerationAuthorizationError } from '../../moderation/authorization.js';
import type { SlashCommand } from '../command.js';

const optionTypes = Eris.Constants.ApplicationCommandOptionTypes;
const ruleChoices = AUTOMOD_RULE_KEYS.map((value) => ({
  name: value.replaceAll('_', ' '),
  value,
}));
const escalationChoices = [
  { name: 'Observe only', value: 'OBSERVE' },
  { name: 'Create a moderator case note', value: 'CASE' },
];
const noMentions: Eris.AllowedMentions = {
  users: [],
  roles: [],
  everyone: false,
  repliedUser: false,
};

export const automodCommand: SlashCommand = {
  definition: {
    name: 'automod',
    description: 'Configure per-server spam and join-burst review rules.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    defaultMemberPermissions: Eris.Constants.Permissions.manageGuild,
    options: [
      {
        name: 'status',
        description: 'Review rule thresholds and allowlist size.',
        type: optionTypes.SUB_COMMAND,
      },
      {
        name: 'rule',
        description: 'Configure one detection rule.',
        type: optionTypes.SUB_COMMAND,
        options: [
          {
            name: 'rule',
            description: 'Detection rule to configure.',
            type: optionTypes.STRING,
            required: true,
            choices: ruleChoices,
          },
          {
            name: 'enabled',
            description: 'Enable this rule.',
            type: optionTypes.BOOLEAN,
            channel_types: undefined as never,
            required: true,
          },
          {
            name: 'threshold',
            description: 'Detection threshold from 1 to 100.',
            type: optionTypes.INTEGER,
            required: true,
            min_value: 1,
            max_value: 100,
          } as Eris.ApplicationCommandOptionsIntegerWithMinMax,
          {
            name: 'window_seconds',
            description: 'Sliding window from 1 to 3600 seconds.',
            type: optionTypes.INTEGER,
            required: true,
            min_value: 1,
            max_value: 3600,
          } as Eris.ApplicationCommandOptionsIntegerWithMinMax,
          {
            name: 'escalation',
            description: 'Observe only or record a moderator case note.',
            type: optionTypes.STRING,
            required: true,
            choices: escalationChoices,
          },
        ],
      },
      {
        name: 'allow',
        description: 'Add a member to the per-server AutoMod allowlist.',
        type: optionTypes.SUB_COMMAND,
        options: [
          {
            name: 'user',
            description: 'Member who should bypass these detections.',
            type: optionTypes.USER,
            channel_types: undefined as never,
            required: true,
          },
        ],
      },
      {
        name: 'unallow',
        description: 'Remove a member from the AutoMod allowlist.',
        type: optionTypes.SUB_COMMAND,
        options: [
          {
            name: 'user',
            description: 'Member to remove from the allowlist.',
            type: optionTypes.USER,
            channel_types: undefined as never,
            required: true,
          },
        ],
      },
    ],
  },
  async execute({ client, interaction, services }) {
    const guildId = interaction.guildID;
    const actorUserId = interaction.member?.id;
    const isOwner = guildId !== undefined && client.guilds.get(guildId)?.ownerID === actorUserId;
    if (guildId === undefined || actorUserId === undefined) {
      throw new ModerationAuthorizationError(
        'permission_denied',
        'AutoMod settings can only be used inside a server.',
      );
    }
    if (!isOwner && !interaction.member?.permissions.has('manageGuild')) {
      throw new ModerationAuthorizationError(
        'permission_denied',
        'You need the Manage Server permission to change AutoMod settings.',
      );
    }
    const automod = services.automod;
    if (automod === undefined) throw new Error('The AutoMod service is not configured.');
    const subcommand = interaction.data.options?.[0];
    if (subcommand === undefined || subcommand.type !== optionTypes.SUB_COMMAND) {
      throw new AutomodConfigurationError(
        'AutoMod subcommand is missing.',
        'Choose an AutoMod action.',
      );
    }
    await deferCommand(interaction, 'ephemeral');

    if (subcommand.name === 'status') {
      const config = await automod.getConfig(guildId);
      const lines = AUTOMOD_RULE_KEYS.map((key) => {
        const rule = config.rules[key];
        return `• ${key.replaceAll('_', ' ')}: ${rule.enabled ? 'on' : 'off'} · ${rule.threshold} in ${rule.windowSeconds}s · ${rule.escalation}`;
      });
      await completeCommand(interaction, {
        content: `AutoMod status (detection only; no automatic timeout or ban):\nMessage scanning listener: ${services.automodRuntime?.messageScanningEnabled === true ? 'enabled' : 'disabled by host configuration'}\nJoin-burst listener: ${services.automodRuntime?.joinMonitoringEnabled === true ? 'enabled' : 'disabled by host configuration'}\n${lines.join('\n')}\nAllowlisted members: ${config.allowlistedUserIds.length}`,
        allowedMentions: noMentions,
      });
      return;
    }

    if (subcommand.name === 'rule') {
      const ruleKey = readString(subcommand.options, 'rule');
      const enabled = readBoolean(subcommand.options, 'enabled');
      const threshold = readInteger(subcommand.options, 'threshold');
      const windowSeconds = readInteger(subcommand.options, 'window_seconds');
      const escalation = readString(subcommand.options, 'escalation');
      if (
        !isRuleKey(ruleKey) ||
        enabled === undefined ||
        threshold === undefined ||
        windowSeconds === undefined ||
        (escalation !== 'OBSERVE' && escalation !== 'CASE')
      ) {
        throw new AutomodConfigurationError(
          'AutoMod rule configuration is incomplete.',
          'Choose a valid rule, enabled state, threshold, window, and escalation.',
        );
      }

      const result = await automod.setRule(interaction.id, guildId, actorUserId, ruleKey, {
        enabled,
        threshold,
        windowSeconds,
        escalation: escalation as AutomodEscalation,
      });
      await completeCommand(interaction, {
        content: `${ruleKey.replaceAll('_', ' ')} is ${enabled ? 'on' : 'off'} at ${threshold} events per ${windowSeconds}s (${escalation}).${result.replayed ? ' This was an idempotent replay.' : ''}`,
        allowedMentions: noMentions,
      });
      return;
    }

    if (subcommand.name === 'allow' || subcommand.name === 'unallow') {
      const userId = readSnowflake(subcommand.options, 'user');
      if (userId === undefined) {
        throw new AutomodConfigurationError('Allowlist user is missing.', 'Choose a valid member.');
      }
      const allowlisted = subcommand.name === 'allow';
      const result = await automod.setAllowlisted(
        interaction.id,
        guildId,
        actorUserId,
        userId,
        allowlisted,
      );
      await completeCommand(interaction, {
        content: `Member ${allowlisted ? 'added to' : 'removed from'} the AutoMod allowlist.${result.replayed ? ' This was an idempotent replay.' : ''}`,
        allowedMentions: noMentions,
      });
      return;
    }

    throw new AutomodConfigurationError(
      'Unknown AutoMod subcommand.',
      'Choose a valid AutoMod action.',
    );
  },
};

function readOption(
  options: Eris.InteractionDataOptions[] | undefined,
  name: string,
): Eris.InteractionDataOptions | undefined {
  return options?.find((option) => option.name === name);
}

function readString(
  options: Eris.InteractionDataOptions[] | undefined,
  name: string,
): string | undefined {
  const option = readOption(options, name);
  return option !== undefined && 'value' in option && typeof option.value === 'string'
    ? option.value
    : undefined;
}

function readSnowflake(
  options: Eris.InteractionDataOptions[] | undefined,
  name: string,
): string | undefined {
  const value = readString(options, name);
  return value !== undefined && /^\d{17,20}$/.test(value) ? value : undefined;
}

function readBoolean(
  options: Eris.InteractionDataOptions[] | undefined,
  name: string,
): boolean | undefined {
  const option = readOption(options, name);
  return option !== undefined && 'value' in option && typeof option.value === 'boolean'
    ? option.value
    : undefined;
}

function readInteger(
  options: Eris.InteractionDataOptions[] | undefined,
  name: string,
): number | undefined {
  const option = readOption(options, name);
  return option !== undefined && 'value' in option && typeof option.value === 'number'
    ? option.value
    : undefined;
}

function isRuleKey(value: string | undefined): value is AutomodRuleKey {
  return value !== undefined && (AUTOMOD_RULE_KEYS as readonly string[]).includes(value);
}
