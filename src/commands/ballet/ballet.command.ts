import * as Eris from 'eris';
import { completeCommand, deferCommand } from '../../interactions/response-policy.js';

import { BALLET_ACTIVITY_CODES } from '../../ballet/activity-codes.js';
import type { SlashCommand } from '../command.js';
import { formatBalance } from '../balance/format-balance.js';
import { NOELIA_COPY } from '../../persona/copy.js';
import { createPersonaEmbedRenderer } from '../../persona/presentation.js';
import { BALLET_CLASS_TYPE_CATALOG } from '../../ballet/class/catalog.js';
import { isBalletClassType } from '../../ballet/class/curriculum.js';
import { renderBalletClassMessage } from './class-presentation.js';
import { BALLET_RECOVERY_ACTIONS } from '../../ballet/training-v3/types.js';

const activityChoices = BALLET_ACTIVITY_CODES.map((code) => ({
  name: code
    .split('-')
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' '),
  value: code,
}));

export const balletCommand: SlashCommand = {
  definition: {
    name: 'ballet',
    description: 'Check your Ballet progress and practice.',
    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
    options: [
      {
        name: 'status',
        description: 'See your Ballet level and XP.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'academy',
        description: 'See your Academy standing and the next milestones.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'activities',
        description: 'See practice activities and unlocks.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'practice',
        description: 'Complete a Ballet practice activity.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'activity',
            description: 'Choose a practice activity.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
            choices: activityChoices,
          },
        ],
      },
      {
        name: 'class',
        description: 'Start or resume a guided Ballet class.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'type',
            description: 'Choose a class focus.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: false,
            choices: BALLET_CLASS_TYPE_CATALOG.map((classType) => ({
              name: classType.displayName,
              value: classType.id,
            })),
          },
        ],
      },
      {
        name: 'training',
        description:
          'View fictional training skills, condition, stamina cycle, and recovery status.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
      },
      {
        name: 'recovery',
        description: 'Use one game-only recovery action.',
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        options: [
          {
            name: 'action',
            description: 'Choose a recovery action.',
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            required: true,
            choices: BALLET_RECOVERY_ACTIONS.map((action) => ({
              name: action[0] + action.slice(1).toLowerCase(),
              value: action,
            })),
          },
        ],
      },
    ],
  },
  async execute({ interaction, services }) {
    const discordUserId = interaction.member?.id;

    if (discordUserId === undefined) {
      throw new Error('The ballet command requires a guild member context.');
    }

    const personaEmbed = createPersonaEmbedRenderer(services.persona, 'ballet', discordUserId);

    const subcommand = interaction.data.options?.[0];

    if (subcommand === undefined) {
      throw new Error('The ballet command requires a subcommand.');
    }

    const subcommandName = subcommand.name;
    await deferCommand(interaction, subcommandName === 'recovery' ? 'ephemeral' : 'public');

    if (subcommandName === 'training') {
      const training = services.balletTrainingV3;
      if (training === undefined) throw new Error('Ballet Training V3 is not configured.');
      const snapshot = await training.getSnapshot(discordUserId);
      const skills = Object.entries(snapshot.skills)
        .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`)
        .join(' · ');
      const cycle =
        snapshot.staminaCycle === null
          ? 'No stamina cycle has started; it begins with your next completed practice or class exercise.'
          : `${snapshot.staminaCycle.status} · ${snapshot.staminaCycle.completedWorkload}/${snapshot.staminaCycle.targetWorkload} workload · deadline <t:${Math.floor(snapshot.staminaCycle.deadlineAt.getTime() / 1_000)}:R>`;
      const setback =
        snapshot.setback.status === 'ACTIVE'
          ? `Active fictional training setback: ${snapshot.setback.completedRehabSessions}/${snapshot.setback.requiredRehabSessions} recovery sessions. It never diagnoses or describes a real injury.`
          : snapshot.setback.status === 'RECOVERED'
            ? 'Most recent fictional training setback: recovered.'
            : 'No active fictional training setback.';
      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            'training_v3_status',
            {
              condition_energy: snapshot.condition.energy,
              condition_fatigue: snapshot.condition.fatigue,
            },
            {
              title: 'Maison Noélia · Training & Readiness',
              description: [
                `**V3 skills:** ${skills}`,
                `**Game condition:** Energy ${snapshot.condition.energy} · Nutrition ${snapshot.condition.nutrition} · Fatigue ${snapshot.condition.fatigue} · Sleep debt ${snapshot.condition.sleepDebt}`,
                `**Stamina cycle:** ${cycle}`,
                `**Setback:** ${setback}`,
                '**Note:** these are fictional gameplay values only, not real training, health, sleep, or nutrition guidance.',
              ].join('\n\n'),
            },
          ),
        ],
      });
      return;
    }

    if (subcommandName === 'recovery') {
      const training = services.balletTrainingV3;
      if (training === undefined) throw new Error('Ballet Training V3 is not configured.');
      const actionOption =
        'options' in subcommand
          ? subcommand.options?.find((option) => option.name === 'action' && 'value' in option)
          : undefined;
      const action =
        actionOption !== undefined &&
        'value' in actionOption &&
        typeof actionOption.value === 'string'
          ? actionOption.value
          : undefined;
      if (
        action === undefined ||
        !(BALLET_RECOVERY_ACTIONS as readonly string[]).includes(action)
      ) {
        throw new Error('A valid game-only recovery action is required.');
      }
      const result = await training.recover(
        interaction.id,
        discordUserId,
        action as (typeof BALLET_RECOVERY_ACTIONS)[number],
      );
      const condition = result.snapshot.condition;
      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            'training_v3_recovery',
            { recovery_action: result.action.toLowerCase(), replayed: result.replayed },
            {
              title: 'Maison Noélia · Recovery updated',
              description: `Game-only condition: Energy ${condition.energy} · Nutrition ${condition.nutrition} · Fatigue ${condition.fatigue} · Sleep debt ${condition.sleepDebt}.${result.action === 'REHABILITATE' ? `\nSetback progress: ${result.snapshot.setback.completedRehabSessions}/${result.snapshot.setback.requiredRehabSessions}.` : ''}\n\nThese values are fictional gameplay state, not health advice.`,
            },
          ),
        ],
      });
      return;
    }

    if (subcommandName === 'class') {
      const balletClass = services.balletClass;
      if (balletClass === undefined) throw new Error('The Ballet class service is not configured.');
      const subcommandOptions = 'options' in subcommand ? subcommand.options : undefined;
      const typeOption = subcommandOptions?.find(
        (option) => option.name === 'type' && 'value' in option,
      );
      const requestedType =
        typeOption !== undefined && 'value' in typeOption && typeof typeOption.value === 'string'
          ? typeOption.value
          : 'REGULAR';
      if (!isBalletClassType(requestedType)) {
        throw new Error('The selected Ballet class type is invalid.');
      }
      const view = await balletClass.startOrResume(interaction.id, discordUserId, requestedType);
      await completeCommand(
        interaction,
        await renderBalletClassMessage(view, services.persona, discordUserId),
      );
      return;
    }

    if (subcommandName === 'status') {
      const progress = await services.ballet.getProgress(discordUserId);
      const nextLevelText =
        progress.xpToNextLevel === null
          ? 'Maximum level reached.'
          : `${formatInteger(progress.xpToNextLevel)} XP to the next level.`;
      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            'status_view',
            {
              level: progress.level,
              total_xp: progress.totalXp.toString(),
              xp_to_next_level: progress.xpToNextLevel?.toString() ?? null,
              technique: progress.stats.technique,
              flexibility: progress.stats.flexibility,
              musicality: progress.stats.musicality,
            },
            {
              title: NOELIA_COPY.balletStatusTitle,
              fields: [
                {
                  name: 'Technique · Flexibility · Musicality',
                  value: `${progress.stats.technique} · ${progress.stats.flexibility} · ${progress.stats.musicality}`,
                  inline: true,
                },
                {
                  name: 'Performance · Pointe · Stamina',
                  value: `${progress.stats.performance} · ${progress.stats.pointe} · ${progress.stats.stamina}`,
                  inline: true,
                },
              ],
              description: `Ballet Level ${progress.level} · ${formatInteger(progress.totalXp)} XP\n${nextLevelText}`,
            },
          ),
        ],
      });
      return;
    }

    if (subcommandName === 'academy') {
      const academy = services.academy;
      if (academy === undefined) throw new Error('The Ballet Academy service is not configured.');
      const progress = await academy.getProgress(discordUserId);
      const uniform = await academy.getUniformStatus(discordUserId);
      const pending =
        progress.nextRank?.requirements.filter((requirement) => !requirement.met) ?? [];
      const description =
        progress.nextRank === null
          ? `${progress.currentRank.description}\nAll Academy distinctions are earned. Keep dancing and improving your stage results.`
          : `${progress.currentRank.description}\n\nNext: **${progress.nextRank.title}**\n${progress.nextRank.requirements
              .map((requirement) => `${requirement.met ? '✓' : '○'} ${requirement.label}`)
              .join('\n')}`;
      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            'academy_view',
            {
              academy_stage: progress.currentRank.id,
              academy_stages_completed: progress.completedRankCount,
              pending_requirements: pending.length,
            },
            {
              title: `${NOELIA_COPY.balletAcademyTitle} · ${progress.currentRank.title}`,
              description: `${description}\n\nUniform: **${uniform.ready ? 'Ready' : 'Incomplete'}** — leotard, tights, and ballet flats are required for standard Academy activities. Check /wardrobe uniform for owned options.${uniform.optionalRankAccent === null ? '' : `\nOptional cosmetic rank styling: ${uniform.optionalRankAccent.label}.`}`,
            },
          ),
        ],
      });
      return;
    }

    if (subcommandName === 'activities') {
      const activities = await services.ballet.listActivities(discordUserId);
      const lines = activities.map((activity) => {
        const state =
          activity.availability === 'LOCKED'
            ? activity.lockReason === 'LEVEL'
              ? `Unlocks at level ${activity.minimumLevel}`
              : activity.lockReason === 'STATS'
                ? `Build ${activity.statRequirements
                    .filter((requirement) => !requirement.met)
                    .map(
                      (requirement) =>
                        `${requirement.key} ${requirement.minimum}+ (now ${requirement.current})`,
                    )
                    .join(', ')}`
                : activity.requiredEquippedItemId !== null
                  ? `Equip ${activity.requiredEquippedItemId}`
                  : `Complete ${activity.requiredActivityCode ?? 'its requirement'} first`
            : activity.availability === 'COOLDOWN' && activity.nextAvailableAt !== null
              ? `Ready <t:${Math.floor(activity.nextAvailableAt.getTime() / 1_000)}:R>`
              : 'Ready now';
        return `• **${activity.displayName}** — ${formatInteger(activity.xpReward)} XP, ${formatBalance(activity.slippersReward)} · ${state}`;
      });
      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            'activities_view',
            {
              activity_count: activities.length,
              ready_count: activities.filter((activity) => activity.availability === 'AVAILABLE')
                .length,
              locked_count: activities.filter((activity) => activity.availability === 'LOCKED')
                .length,
            },
            {
              title: NOELIA_COPY.balletActivitiesTitle,
              fields: activities.map((activity) => ({
                name: `${activity.displayName} · ${activity.statKey} +${activity.statGain}`,
                value: `${activity.description}${activity.requiredEquippedItemId === null ? '' : ` · Equip ${activity.requiredEquippedItemId}`}${activity.requiredActivityCode === null ? '' : ` · Complete ${activity.requiredActivityCode}`}${activity.statRequirements.length === 0 ? '' : ` · ${activity.statRequirements.map((requirement) => `${requirement.key} ${requirement.minimum}+`).join(', ')}`}`,
                inline: false,
              })),
              description:
                lines.length === 0
                  ? 'No Ballet activities are available right now.'
                  : lines.join('\n'),
            },
          ),
        ],
      });
      return;
    }

    if (subcommandName === 'practice') {
      const subcommandOptions = 'options' in subcommand ? subcommand.options : undefined;
      const activityOption = subcommandOptions?.find(
        (option) => option.name === 'activity' && 'value' in option,
      );
      const activityCode =
        activityOption !== undefined &&
        'value' in activityOption &&
        typeof activityOption.value === 'string'
          ? activityOption.value
          : undefined;

      if (activityCode === undefined) {
        throw new Error('The ballet practice activity option is missing.');
      }

      const result = await services.ballet.practice(interaction.id, discordUserId, activityCode);
      const nextLevelText =
        result.nextLevelXp === null
          ? 'Maximum Ballet level reached.'
          : `${formatInteger(result.nextLevelXp)} XP to the next level.`;
      const heading = result.replayed
        ? NOELIA_COPY.balletPracticeReplayed
        : NOELIA_COPY.balletPracticeComplete;

      await completeCommand(interaction, {
        embeds: [
          await personaEmbed(
            result.replayed ? 'practice_replayed' : 'practice_complete',
            {
              activity: result.activityCode.replaceAll('-', '_'),
              xp_gained: result.xpAwarded.toString(),
              slippers_gained: result.slippersAwarded.toString(),
              stat: result.stat?.key ?? null,
              stat_gain: result.stat?.gain ?? 0,
              level: result.level,
              xp_to_next_level: result.nextLevelXp?.toString() ?? null,
              replayed: result.replayed,
            },
            {
              title: heading,
              fields:
                result.stat === null
                  ? []
                  : [
                      {
                        name: `${result.stat.key} · +${result.stat.gain}`,
                        value: `${result.stat.value}/100`,
                        inline: true,
                      },
                    ],
              description: `${result.displayName} · +${formatInteger(result.xpAwarded)} Ballet XP · +${formatBalance(result.slippersAwarded)}\nLevel ${result.level} · ${formatInteger(result.totalXp)} XP · ${nextLevelText}`,
              tone: result.replayed ? 'signature' : 'success',
            },
          ),
        ],
      });
      return;
    }

    throw new Error('Unsupported ballet subcommand.');
  },
};

function formatInteger(value: bigint): string {
  return new Intl.NumberFormat('en-US').format(value);
}
