import * as Eris from 'eris';

import type { CommandContext } from '../commands/command.js';
import type { CommandServices } from '../commands/command.js';
import type { CommandRegistry } from '../commands/registry.js';
import type { StructuredLogger } from '../infrastructure/logging/logger.js';
import { ExpectedDomainError } from '../utils/expected-domain-error.js';
import { NOELIA_COPY } from '../persona/copy.js';
import { parseRelationshipButtonId } from '../relationships/components.js';
import type { RelationshipProposalStatus } from '../relationships/types.js';
import { respondPrivately, respondPrivatelyToComponent } from './response-policy.js';
import {
  isBalletClassComponentId,
  parseBalletClassComponentId,
} from '../ballet/class/components.js';
import { renderBalletClassMessage } from '../commands/ballet/class-presentation.js';
import type { BalletClassAttempt, BalletClassView } from '../ballet/class/types.js';
import {
  createAcademyAssessmentComponents,
  isAcademyAssessmentComponentId,
  parseAcademyAssessmentComponentId,
} from '../ballet/assessment/components.js';
import { renderAcademyAssessment } from '../commands/academy/academy.command.js';
import { createPersonaEmbedRenderer } from '../persona/presentation.js';

export class InteractionRouter {
  public constructor(
    private readonly registry: CommandRegistry,
    private readonly logger: StructuredLogger,
    private readonly services: CommandServices,
  ) {}

  public async dispatch(interaction: Eris.CommandInteraction, client: Eris.Client): Promise<void> {
    const command = this.registry.get(interaction.data.name);

    if (command === undefined) {
      this.logger.warn('discord.command_unknown', {
        commandName: interaction.data.name,
        interactionId: interaction.id,
      });
      await this.respond(interaction, 'That command is not available.');
      return;
    }

    const context: CommandContext = { client, interaction, services: this.services };

    try {
      await command.execute(context);
    } catch (error) {
      if (error instanceof ExpectedDomainError) {
        this.logger.info('discord.command_rejected', {
          commandName: command.definition.name,
          errorType: error.name,
          interactionId: interaction.id,
        });
        try {
          await this.respond(interaction, error.userMessage);
        } catch (responseError) {
          this.logger.error('discord.command_error_response_failed', responseError, {
            commandName: command.definition.name,
            interactionId: interaction.id,
          });
        }
        return;
      }

      this.logger.error('discord.command_failed', error, {
        commandName: command.definition.name,
        interactionId: interaction.id,
      });

      try {
        await this.respond(
          interaction,
          'Noélia could not complete that command. Please try again in a moment.',
        );
      } catch (responseError) {
        this.logger.error('discord.command_error_response_failed', responseError, {
          commandName: command.definition.name,
          interactionId: interaction.id,
        });
      }
    }
  }

  public async dispatchComponent(interaction: Eris.ComponentInteraction): Promise<void> {
    if (isAcademyAssessmentComponentId(interaction.data.custom_id)) {
      await this.dispatchAcademyAssessmentComponent(interaction);
      return;
    }
    if (isBalletClassComponentId(interaction.data.custom_id)) {
      await this.dispatchBalletClassComponent(interaction);
      return;
    }

    const parsed = parseRelationshipButtonId(interaction.data.custom_id);
    if (parsed === null) {
      await interaction.createMessage({
        content: 'That interaction is no longer available.',
        flags: Eris.Constants.MessageFlags.EPHEMERAL,
      });
      return;
    }

    const guildId = interaction.guildID;
    const actorUserId = interaction.member?.id;
    const relationships = this.services.relationships;
    if (guildId === undefined || actorUserId === undefined || relationships === undefined) {
      await interaction.createMessage({
        content: 'This proposal can only be answered in its server.',
        flags: Eris.Constants.MessageFlags.EPHEMERAL,
      });
      return;
    }

    try {
      await interaction.deferUpdate();
      let status: RelationshipProposalStatus;

      if (parsed.action === 'cancel') {
        const result = await relationships.cancel(
          interaction.id,
          guildId,
          actorUserId,
          parsed.proposalId,
        );
        status = result.status;
      } else {
        const result = await relationships.respond(
          interaction.id,
          guildId,
          actorUserId,
          parsed.proposalId,
          parsed.action === 'accept' ? 'ACCEPT' : 'DECLINE',
        );
        status = result.status;
      }

      const content = this.relationshipResultCopy(status);
      await interaction.editParent({ content, components: [] });
    } catch (error) {
      if (error instanceof ExpectedDomainError) {
        this.logger.info('discord.component_rejected', {
          component: 'marriage_proposal',
          errorType: error.name,
          interactionId: interaction.id,
        });
        await this.respondComponent(interaction, error.userMessage);
        return;
      }

      this.logger.error('discord.component_failed', error, {
        component: 'marriage_proposal',
        interactionId: interaction.id,
      });
      await this.respondComponent(
        interaction,
        'Noélia could not complete that action. Please try again in a moment.',
      );
    }
  }

  private async dispatchAcademyAssessmentComponent(
    interaction: Eris.ComponentInteraction,
  ): Promise<void> {
    const parsed = parseAcademyAssessmentComponentId(interaction.data.custom_id);
    const discordUserId = interaction.member?.id;
    const assessment = this.services.academyAssessment;
    if (parsed === null || interaction.guildID === undefined) {
      await interaction.createMessage({
        content: 'That Academy assessment control is no longer available.',
        flags: Eris.Constants.MessageFlags.EPHEMERAL,
      });
      return;
    }
    if (discordUserId === undefined || assessment === undefined) {
      await interaction.createMessage({
        content: 'Academy assessments are available from a server member session.',
        flags: Eris.Constants.MessageFlags.EPHEMERAL,
      });
      return;
    }

    try {
      await interaction.deferUpdate();
      if (parsed.action === 'start') {
        await assessment.start(interaction.id, discordUserId);
      } else {
        await assessment.answer(
          interaction.id,
          discordUserId,
          parsed.attemptId,
          parsed.questionId,
          parsed.answerId,
        );
      }
      const overview = await assessment.getOverview(discordUserId);
      const personaEmbed = createPersonaEmbedRenderer(
        this.services.persona,
        'ballet',
        discordUserId,
      );
      await interaction.editParent({
        embeds: [await renderAcademyAssessment(overview, personaEmbed)],
        components: createAcademyAssessmentComponents(overview),
      });
    } catch (error) {
      if (error instanceof ExpectedDomainError) {
        this.logger.info('discord.component_rejected', {
          component: 'academy_assessment',
          errorType: error.name,
          interactionId: interaction.id,
        });
        await this.respondComponent(interaction, error.userMessage);
        return;
      }
      this.logger.error('discord.component_failed', error, {
        component: 'academy_assessment',
        interactionId: interaction.id,
      });
      await this.respondComponent(
        interaction,
        'Noélia could not update this Academy assessment. Please try again in a moment.',
      );
    }
  }

  private async dispatchBalletClassComponent(
    interaction: Eris.ComponentInteraction,
  ): Promise<void> {
    const parsed = parseBalletClassComponentId(interaction.data.custom_id);
    const discordUserId = interaction.member?.id;
    const balletClass = this.services.balletClass;
    if (parsed === null || interaction.guildID === undefined) {
      await interaction.createMessage({
        content: 'That Ballet class control is no longer available.',
        flags: Eris.Constants.MessageFlags.EPHEMERAL,
      });
      return;
    }
    if (discordUserId === undefined || balletClass === undefined) {
      await interaction.createMessage({
        content: 'Ballet classes are available from a server member session.',
        flags: Eris.Constants.MessageFlags.EPHEMERAL,
      });
      return;
    }

    try {
      await interaction.deferUpdate();
      let view: BalletClassView;
      let latestAttempt: BalletClassAttempt | undefined;
      if (parsed.action === 'preparation') {
        view = await balletClass.markPreparation(
          interaction.id,
          discordUserId,
          parsed.classId,
          parsed.area,
        );
      } else if (parsed.action === 'begin') {
        view = await balletClass.begin(interaction.id, discordUserId, parsed.classId);
      } else if (parsed.action === 'attempt') {
        const result = await balletClass.attempt(
          interaction.id,
          discordUserId,
          parsed.classId,
          parsed.exerciseId,
        );
        view = result.class;
        latestAttempt = result.attempt ?? undefined;
      } else {
        view = await balletClass.abandon(interaction.id, discordUserId, parsed.classId);
      }
      await interaction.editParent(
        await renderBalletClassMessage(view, this.services.persona, discordUserId, latestAttempt),
      );
    } catch (error) {
      if (error instanceof ExpectedDomainError) {
        this.logger.info('discord.component_rejected', {
          component: 'ballet_class',
          errorType: error.name,
          interactionId: interaction.id,
        });
        await this.respondComponent(interaction, error.userMessage);
        return;
      }
      this.logger.error('discord.component_failed', error, {
        component: 'ballet_class',
        interactionId: interaction.id,
      });
      await this.respondComponent(
        interaction,
        'Noélia could not update this Ballet class. Please try again in a moment.',
      );
    }
  }

  private async respondComponent(
    interaction: Eris.ComponentInteraction,
    content: string,
  ): Promise<void> {
    await respondPrivatelyToComponent(interaction, content);
  }

  private relationshipResultCopy(status: RelationshipProposalStatus): string {
    if (status === 'ACCEPTED') return NOELIA_COPY.marriageAccepted;
    if (status === 'DECLINED') return NOELIA_COPY.marriageDeclined;
    if (status === 'CANCELLED') return NOELIA_COPY.marriageCancelled;
    return NOELIA_COPY.marriagePending;
  }

  private async respond(interaction: Eris.CommandInteraction, content: string): Promise<void> {
    await respondPrivately(interaction, content);
  }
}
