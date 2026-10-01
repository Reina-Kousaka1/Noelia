import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import type { CommandContext } from '../../src/commands/command.js';
import {
  banCommand,
  kickCommand,
  modcaseCommand,
  timeoutCommand,
  warnCommand,
  warningsCommand,
} from '../../src/commands/moderation/moderation.command.js';
import { ModerationAuthorizationError } from '../../src/moderation/authorization.js';

const ids = {
  guild: '111111111111111111',
  actor: '222222222222222222',
  target: '333333333333333333',
  bot: '444444444444444444',
  interaction: '555555555555555555',
  case: '1',
};

function makeContext(actorPermission = true): {
  readonly context: CommandContext;
  readonly moderation: {
    readonly createAttempt: ReturnType<typeof vi.fn>;
    readonly recordOutcome: ReturnType<typeof vi.fn>;
    readonly getCase: ReturnType<typeof vi.fn>;
    readonly listCases: ReturnType<typeof vi.fn>;
  };
  readonly interaction: Record<string, unknown>;
  readonly guild: Record<string, unknown>;
} {
  const targetMember = { id: ids.target, roles: ['target-role'] };
  const botMember = {
    id: ids.bot,
    roles: ['bot-role'],
    permissions: { has: vi.fn(() => true) },
  };
  const guild: Record<string, unknown> = {
    id: ids.guild,
    ownerID: '666666666666666666',
    roles: {
      get: (roleId: string) =>
        ({
          'target-role': { position: 1 },
          'actor-role': { position: 10 },
          'bot-role': { position: 20 },
        })[roleId],
    },
    members: {
      get: (memberId: string) =>
        memberId === ids.bot ? botMember : memberId === ids.target ? targetMember : undefined,
    },
    kickMember: vi.fn().mockResolvedValue(undefined),
    banMember: vi.fn().mockResolvedValue(undefined),
    editMember: vi.fn().mockResolvedValue(undefined),
  };
  const caseRecord = {
    caseId: ids.case,
    guildId: ids.guild,
    targetUserId: ids.target,
    actorUserId: ids.actor,
    action: 'warning',
    source: 'manual',
    reason: 'Repeated off-topic messages',
    occurredAt: new Date('2026-10-01T12:00:00.000Z'),
    expiresAt: null,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    outcome: null,
    outcomeCode: null,
    outcomeRecordedAt: null,
  };
  const moderation = {
    createAttempt: vi.fn().mockResolvedValue({ case: caseRecord, created: true }),
    recordOutcome: vi.fn().mockResolvedValue({
      outcome: 'SUCCEEDED',
      outcomeCode: null,
      replayed: false,
    }),
    getCase: vi.fn().mockResolvedValue(caseRecord),
    listCases: vi.fn().mockResolvedValue({
      cases: [caseRecord],
      page: 1,
      pageSize: 10,
      totalCases: 1,
      totalPages: 1,
    }),
  };
  const interaction: Record<string, unknown> = {
    acknowledged: false,
    id: ids.interaction,
    guildID: ids.guild,
    member: {
      id: ids.actor,
      roles: ['actor-role'],
      permissions: { has: vi.fn(() => actorPermission) },
    },
    appPermissions: { has: vi.fn(() => true) },
    data: {
      options: [
        {
          name: 'user',
          type: Eris.Constants.ApplicationCommandOptionTypes.USER,
          value: ids.target,
        },
        {
          name: 'reason',
          type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
          value: 'Repeated off-topic messages',
        },
      ],
      resolved: { members: { get: () => targetMember } },
    },
    defer: vi.fn(async () => {
      interaction.acknowledged = true;
    }),
    createMessage: vi.fn(async () => {
      interaction.acknowledged = true;
    }),
    deleteOriginalMessage: vi.fn().mockResolvedValue(undefined),
    createFollowup: vi.fn().mockResolvedValue(undefined),
    editOriginalMessage: vi.fn().mockResolvedValue(undefined),
  };
  const client = {
    guilds: { get: () => guild },
    user: { id: ids.bot },
  };

  return {
    context: {
      client: client as unknown as Eris.Client,
      interaction: interaction as unknown as Eris.CommandInteraction,
      services: { moderation } as unknown as CommandContext['services'],
    },
    moderation,
    interaction,
    guild,
  };
}

describe('moderation commands', () => {
  it('registers all requested case and enforcement commands with permission gates', () => {
    expect(
      [warnCommand, warningsCommand, modcaseCommand, timeoutCommand, kickCommand, banCommand].map(
        (command) => command.definition.name,
      ),
    ).toEqual(['warn', 'warnings', 'modcase', 'timeout', 'kick', 'ban']);
    expect(warnCommand.definition.defaultMemberPermissions).toBe(
      Eris.Constants.Permissions.manageMessages,
    );
    expect(timeoutCommand.definition.defaultMemberPermissions).toBe(
      Eris.Constants.Permissions.moderateMembers,
    );
    expect(kickCommand.definition.defaultMemberPermissions).toBe(
      Eris.Constants.Permissions.kickMembers,
    );
    expect(banCommand.definition.defaultMemberPermissions).toBe(
      Eris.Constants.Permissions.banMembers,
    );
  });

  it('records successful warnings privately without running an external action', async () => {
    const { context, moderation, interaction, guild } = makeContext();
    await warnCommand.execute(context);

    expect(interaction.defer).toHaveBeenCalledWith(Eris.Constants.MessageFlags.EPHEMERAL);
    expect(moderation.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'warning',
        source: 'manual',
        idempotencyKey: ids.interaction,
      }),
    );
    expect(moderation.recordOutcome).toHaveBeenCalledWith(ids.case, 'SUCCEEDED');
    expect(guild.kickMember).not.toHaveBeenCalled();
    expect(interaction.editOriginalMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('case #1') }),
    );
  });

  it('denies an unauthorized actor before case creation or Discord mutation', async () => {
    const { context, moderation, interaction, guild } = makeContext(false);

    await expect(warnCommand.execute(context)).rejects.toBeInstanceOf(ModerationAuthorizationError);
    expect(moderation.createAttempt).not.toHaveBeenCalled();
    expect(interaction.defer).not.toHaveBeenCalled();
    expect(guild.kickMember).not.toHaveBeenCalled();
  });

  it('records successful enforcement only after Discord confirms the kick', async () => {
    const { context, moderation, guild } = makeContext();
    await kickCommand.execute(context);

    expect(guild.kickMember).toHaveBeenCalledWith(ids.target, 'Repeated off-topic messages');
    expect(moderation.recordOutcome).toHaveBeenCalledWith(ids.case, 'SUCCEEDED');
  });
});
