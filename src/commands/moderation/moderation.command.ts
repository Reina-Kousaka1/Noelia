import * as Eris from 'eris';

import { completeCommand, deferCommand } from '../../interactions/response-policy.js';
import {
  assertModerationAuthorization,
  ModerationAuthorizationError,
} from '../../moderation/authorization.js';
import type { ModerationPermission } from '../../moderation/authorization.js';
import {
  ModerationCaseIdError,
  ModerationCommandInputError,
} from '../../moderation/moderation-errors.js';
import type { ModerationCaseRecord } from '../../moderation/moderation-types.js';
import type { SlashCommand } from '../command.js';

const optionTypes = Eris.Constants.ApplicationCommandOptionTypes;
const MAX_REASON_LENGTH = 512;
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;

interface ModerationCommandSpec {
  readonly name: 'warn' | 'timeout' | 'kick' | 'ban';
  readonly description: string;
  readonly permission: ModerationPermission;
}

function userAndReasonOptions(): Eris.ApplicationCommandOptions[] {
  return [
    {
      name: 'user',
      description: 'The server member to moderate.',
      type: optionTypes.USER,
      channel_types: undefined as never,
      required: true,
    },
    {
      name: 'reason',
      description: 'A concise factual reason recorded with the case.',
      type: optionTypes.STRING,
      required: true,
    },
  ];
}

function createActionCommand(spec: ModerationCommandSpec): SlashCommand {
  const options = userAndReasonOptions();
  if (spec.name === 'timeout') {
    options.push({
      name: 'minutes',
      description: 'Timeout duration, from 1 minute to 28 days.',
      type: optionTypes.INTEGER,
      required: true,
      min_value: 1,
      max_value: MAX_TIMEOUT_MINUTES,
    } as Eris.ApplicationCommandOptionsIntegerWithMinMax);
  }
  if (spec.name === 'ban') {
    options.push({
      name: 'delete_message_days',
      description: 'Delete recent messages from the member (0–7 days).',
      type: optionTypes.INTEGER,
      required: false,
      min_value: 0,
      max_value: 7,
    } as Eris.ApplicationCommandOptionsIntegerWithMinMax);
  }

  return {
    definition: {
      name: spec.name,
      description: spec.description,
      type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
      defaultMemberPermissions: Eris.Constants.Permissions[spec.permission],
      options,
    },
    async execute({ client, interaction, services }) {
      const guildId = interaction.guildID;
      const actorUserId = interaction.member?.id;
      const userOption = interaction.data.options?.find((option) => option.name === 'user');
      const reasonOption = interaction.data.options?.find((option) => option.name === 'reason');
      const targetUserId = readSnowflake(userOption);
      const reason = readString(reasonOption)?.trim();
      const moderation = services.moderation;
      if (guildId === undefined || actorUserId === undefined) {
        throw new ModerationAuthorizationError(
          'permission_denied',
          'This moderation command can only be used in a server.',
        );
      }
      if (targetUserId === undefined) {
        throw new ModerationCommandInputError('Choose a valid server member.');
      }
      if (reason === undefined || reason.length === 0 || reason.length > MAX_REASON_LENGTH) {
        throw new ModerationCommandInputError('Provide a reason of 1–512 characters.');
      }
      if (moderation === undefined) throw new Error('The moderation service is not configured.');

      const guild = client.guilds.get(guildId);
      if (guild === undefined) {
        throw new ModerationAuthorizationError(
          'hierarchy_unavailable',
          'Noélia could not safely verify server roles and permissions.',
        );
      }
      let targetMember =
        interaction.data.resolved?.members?.get(targetUserId) ?? guild.members.get(targetUserId);
      if (targetMember === undefined) {
        targetMember = (await getRestMember(client, guildId, targetUserId)) ?? undefined;
      }
      let botMember = guild.members.get(client.user.id);
      if (botMember === undefined) {
        botMember = (await getRestMember(client, guildId, client.user.id)) ?? undefined;
      }
      if (botMember === undefined) {
        throw new ModerationAuthorizationError(
          'hierarchy_unavailable',
          'Noélia could not safely verify her role in this server.',
        );
      }

      const actorHighest = highestRolePosition(guild, interaction.member?.roles ?? []);
      const targetHighest = highestRolePosition(guild, targetMember?.roles ?? []);
      const botHighest = highestRolePosition(guild, botMember.roles);
      const hasAppPermission = interaction.appPermissions?.has(spec.permission) ?? false;
      const actorHasPermission = interaction.member?.permissions.has(spec.permission) ?? false;
      assertModerationAuthorization({
        actorUserId,
        targetUserId,
        guildOwnerId: guild.ownerID,
        requiredPermission: spec.permission,
        actorHasPermission,
        botHasPermission: hasAppPermission && botMember.permissions.has(spec.permission),
        targetMemberPresent: targetMember !== undefined,
        requiresTargetMember: true,
        actorHighestRolePosition: actorHighest,
        targetHighestRolePosition: targetHighest,
        botHighestRolePosition: botHighest,
      });

      const now = new Date();
      const minutes = spec.name === 'timeout' ? readInteger(interaction, 'minutes') : undefined;
      if (
        spec.name === 'timeout' &&
        (minutes === undefined || minutes < 1 || minutes > MAX_TIMEOUT_MINUTES)
      ) {
        throw new Error('Validated timeout duration is missing.');
      }
      const expiresAt = minutes === undefined ? null : new Date(now.getTime() + minutes * 60_000);
      await deferCommand(interaction, 'ephemeral');
      const attempt = await moderation.createAttempt({
        idempotencyKey: interaction.id,
        guildId,
        actorUserId,
        targetUserId,
        action: spec.name === 'warn' ? 'warning' : spec.name,
        source: 'manual',
        reason,
        occurredAt: now,
        expiresAt,
      });

      if (!attempt.created) {
        await completeCommand(interaction, {
          content: replayMessage(attempt.case),
          allowedMentions: noMentions,
        });
        return;
      }

      try {
        if (spec.name === 'kick') await guild.kickMember(targetUserId, reason);
        if (spec.name === 'ban') {
          const days = readInteger(interaction, 'delete_message_days') ?? 0;
          await guild.banMember(targetUserId, { deleteMessageSeconds: days * 86_400, reason });
        }
        if (spec.name === 'timeout') {
          await guild.editMember(targetUserId, { communicationDisabledUntil: expiresAt }, reason);
        }
      } catch (error) {
        const outcome = error instanceof Eris.DiscordRESTError ? 'FAILED' : 'UNKNOWN';
        const outcomeCode =
          error instanceof Eris.DiscordRESTError ? String(error.code) : 'REST_RESULT_UNKNOWN';
        await moderation.recordOutcome(attempt.case.caseId, outcome, outcomeCode);
        await completeCommand(interaction, {
          content: `Discord did not confirm the ${spec.name} action. Case #${attempt.case.caseId} is recorded as ${outcome.toLowerCase()}; review it before retrying.`,
          allowedMentions: noMentions,
        });
        return;
      }

      await moderation.recordOutcome(attempt.case.caseId, 'SUCCEEDED');
      await completeCommand(interaction, {
        content: `${spec.name} recorded as case #${attempt.case.caseId} for <@${targetUserId}>.`,
        allowedMentions: noMentions,
      });
    },
  };
}

function createReadCommand(
  name: 'warnings' | 'modcase',
  description: string,
  options: Eris.ApplicationCommandOptions[],
): SlashCommand {
  return {
    definition: {
      name,
      description,
      type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
      defaultMemberPermissions: Eris.Constants.Permissions.manageMessages,
      options,
    },
    async execute({ interaction, services }) {
      const guildId = interaction.guildID;
      if (guildId === undefined || !interaction.member?.permissions.has('manageMessages')) {
        throw new ModerationAuthorizationError(
          'permission_denied',
          'You need the manageMessages permission to view moderation cases.',
        );
      }
      const moderation = services.moderation;
      if (moderation === undefined) throw new Error('The moderation service is not configured.');
      await deferCommand(interaction, 'ephemeral');

      if (name === 'warnings') {
        const targetUserId = readSnowflake(
          interaction.data.options?.find((option) => option.name === 'user'),
        );
        if (targetUserId === undefined) {
          throw new ModerationCommandInputError('Choose a valid server member.');
        }
        const result = await moderation.listCases(guildId, targetUserId, 1, 'warning');
        const lines = result.cases.map(formatCaseLine);
        await completeCommand(interaction, {
          content:
            lines.length === 0
              ? `No recorded warnings for <@${targetUserId}>.`
              : `Warnings for <@${targetUserId}> (${result.totalCases} total):\n${lines.join('\n')}`,
          allowedMentions: noMentions,
        });
        return;
      }

      const caseId = readString(
        interaction.data.options?.find((option) => option.name === 'case_id'),
      );
      if (caseId === undefined) throw new ModerationCaseIdError();
      const record = await moderation.getCase(guildId, caseId);
      if (record === null) throw new ModerationCaseIdError();
      await completeCommand(interaction, {
        content: formatCaseDetail(record),
        allowedMentions: noMentions,
      });
    },
  };
}

export const warnCommand = createActionCommand({
  name: 'warn',
  description: 'Record a factual warning for a server member.',
  permission: 'manageMessages',
});
export const timeoutCommand = createActionCommand({
  name: 'timeout',
  description: 'Temporarily prevent a server member from communicating.',
  permission: 'moderateMembers',
});
export const kickCommand = createActionCommand({
  name: 'kick',
  description: 'Remove a server member.',
  permission: 'kickMembers',
});
export const banCommand = createActionCommand({
  name: 'ban',
  description: 'Ban a server member.',
  permission: 'banMembers',
});
export const warningsCommand = createReadCommand('warnings', 'Review a member’s warning history.', [
  {
    name: 'user',
    description: 'The member whose warnings should be reviewed.',
    type: optionTypes.USER,
    channel_types: undefined as never,
    required: true,
  },
]);
export const modcaseCommand = createReadCommand('modcase', 'Review one moderation case.', [
  {
    name: 'case_id',
    description: 'The case number shown by a moderation command.',
    type: optionTypes.STRING,
    required: true,
  },
]);
export const moderationCommands: readonly SlashCommand[] = [
  warnCommand,
  warningsCommand,
  modcaseCommand,
  timeoutCommand,
  kickCommand,
  banCommand,
];

const noMentions: Eris.AllowedMentions = {
  users: [],
  roles: [],
  everyone: false,
  repliedUser: false,
};

function highestRolePosition(guild: Eris.Guild, roleIds: readonly string[]): number {
  let highest = 0;
  for (const roleId of roleIds) {
    const role = guild.roles.get(roleId);
    if (role === undefined) {
      throw new ModerationAuthorizationError(
        'hierarchy_unavailable',
        'Noélia could not safely verify the role hierarchy.',
      );
    }
    highest = Math.max(highest, role.position);
  }
  return highest;
}

async function getRestMember(
  client: Eris.Client,
  guildId: string,
  userId: string,
): Promise<Eris.Member | null> {
  try {
    return await client.getRESTGuildMember(guildId, userId);
  } catch (error) {
    if (error instanceof Eris.DiscordRESTError && error.code === 10007) return null;
    throw new ModerationAuthorizationError(
      'hierarchy_unavailable',
      'Noélia could not safely fetch current server role data. Try again shortly.',
    );
  }
}

function readSnowflake(option: Eris.InteractionDataOptions | undefined): string | undefined {
  if (option === undefined || !('value' in option) || typeof option.value !== 'string') {
    return undefined;
  }
  return /^\d{17,20}$/.test(option.value) ? option.value : undefined;
}

function readString(option: Eris.InteractionDataOptions | undefined): string | undefined {
  return option !== undefined && 'value' in option && typeof option.value === 'string'
    ? option.value
    : undefined;
}

function readInteger(interaction: Eris.CommandInteraction, name: string): number | undefined {
  const option = interaction.data.options?.find((candidate) => candidate.name === name);
  return option !== undefined && 'value' in option && typeof option.value === 'number'
    ? option.value
    : undefined;
}

function replayMessage(record: ModerationCaseRecord): string {
  const result = record.outcome?.toLowerCase() ?? 'still unresolved';
  return `Case #${record.caseId} already exists (${result}). The external action was not repeated; review the case before retrying.`;
}

function formatCaseLine(record: ModerationCaseRecord): string {
  return `#${record.caseId} — ${record.occurredAt.toISOString()} — ${record.outcome?.toLowerCase() ?? 'unresolved'} — ${truncate(record.reason ?? 'No reason recorded', 120)}`;
}

function formatCaseDetail(record: ModerationCaseRecord): string {
  return [
    `Case #${record.caseId} · ${record.action.toUpperCase()} · ${record.outcome?.toLowerCase() ?? 'unresolved'}`,
    `Target: <@${record.targetUserId}> · Moderator: <@${record.actorUserId}>`,
    `Created: ${record.occurredAt.toISOString()}`,
    ...(record.expiresAt === null ? [] : [`Expires: ${record.expiresAt.toISOString()}`]),
    `Reason: ${record.reason ?? 'No reason recorded'}`,
    ...(record.outcomeCode === null ? [] : [`Outcome code: ${record.outcomeCode}`]),
  ].join('\n');
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
