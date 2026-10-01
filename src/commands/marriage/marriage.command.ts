import * as Eris from 'eris';

import type { SlashCommand } from '../command.js';
import { NOELIA_COPY } from '../../persona/copy.js';
import { createNoeliaEmbed } from '../../ui/embed.js';
import { createRelationshipProposalButtons } from '../../relationships/components.js';

const userOption = Eris.Constants.ApplicationCommandOptionTypes.USER;

export const marryCommand: SlashCommand = {
  definition: {
    name: 'marry',
    description: 'Send another dancer a little studio proposal.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'user',
        description: 'The person you would like to ask.',
        type: userOption,
        channel_types: undefined as never,
        required: true,
      },
    ],
  },
  async execute({ interaction, services }) {
    const guildId = interaction.guildID;
    const proposerUserId = interaction.member?.id;
    const targetOption = interaction.data.options?.find((option) => option.name === 'user');
    const targetUserId =
      targetOption !== undefined &&
      'value' in targetOption &&
      typeof targetOption.value === 'string'
        ? targetOption.value
        : undefined;
    const relationships = services.relationships;

    if (guildId === undefined || proposerUserId === undefined) {
      throw new Error('The marry command requires a guild member context.');
    }
    if (targetUserId === undefined) throw new Error('The proposal target is missing.');
    if (relationships === undefined) throw new Error('The relationship service is not configured.');

    await interaction.defer();
    const result = await relationships.propose(
      interaction.id,
      guildId,
      proposerUserId,
      targetUserId,
    );
    await interaction.createFollowup({
      content: NOELIA_COPY.marriageProposal(proposerUserId, targetUserId),
      components: createRelationshipProposalButtons(result.proposal.proposalId),
      allowedMentions: {
        users: [proposerUserId, targetUserId],
        roles: false,
        everyone: false,
        repliedUser: false,
      },
    });
  },
};

export const marriageCommand: SlashCommand = {
  definition: {
    name: 'marriage',
    description: 'See your current studio promise.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;
    const relationships = services.relationships;
    if (discordUserId === undefined)
      throw new Error('The marriage command requires a guild context.');
    if (relationships === undefined) throw new Error('The relationship service is not configured.');

    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);
    const marriage = await relationships.getMarriage(discordUserId);
    const description =
      marriage === null
        ? NOELIA_COPY.marriageNone
        : NOELIA_COPY.marriageStatus(
            marriage.partnerUserId,
            new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(marriage.marriedAt),
          );
    await interaction.createFollowup({
      embeds: [createNoeliaEmbed({ title: NOELIA_COPY.marriageTitle, description })],
    });
  },
};

export const divorceCommand: SlashCommand = {
  definition: {
    name: 'divorce',
    description: 'End your current studio promise.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;
    const relationships = services.relationships;
    if (discordUserId === undefined)
      throw new Error('The divorce command requires a guild context.');
    if (relationships === undefined) throw new Error('The relationship service is not configured.');

    await interaction.defer(Eris.Constants.MessageFlags.EPHEMERAL);
    const result = await relationships.divorce(interaction.id, discordUserId);
    await interaction.createFollowup({
      embeds: [
        createNoeliaEmbed({
          title: NOELIA_COPY.marriageTitle,
          description: NOELIA_COPY.marriageDivorced,
          tone: result.replayed ? 'signature' : 'success',
        }),
      ],
    });
  },
};
