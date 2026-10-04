import * as Eris from 'eris';
import { describe, expect, it, vi } from 'vitest';

import { balletCommand } from '../../src/commands/ballet/ballet.command.js';
import { formatBalance } from '../../src/commands/balance/format-balance.js';
import { NOELIA_COPY } from '../../src/persona/copy.js';
import type { PersonaTextPort } from '../../src/persona/generator.js';
import { buildBalletClassCurriculum } from '../../src/ballet/class/curriculum.js';

function createInteraction(options: Eris.InteractionDataOptions[]) {
  const defer = vi.fn().mockResolvedValue(undefined);
  const editOriginalMessage = vi.fn().mockResolvedValue(undefined);
  const interaction = {
    id: '111111111111111111',
    member: { id: '222222222222222222' },
    data: { options },
    acknowledged: true,

    defer,
    editOriginalMessage,
  } as unknown as Eris.CommandInteraction;

  return { interaction, defer, editOriginalMessage };
}

function createServices() {
  return {
    economy: { getBalance: vi.fn() },
    daily: { claimDaily: vi.fn() },
    ballet: {
      getProgress: vi.fn(),
      listActivities: vi.fn(),
      practice: vi.fn(),
    },
    balletClass: {
      startOrResume: vi.fn(),
      getClass: vi.fn(),
      markPreparation: vi.fn(),
      begin: vi.fn(),
      attempt: vi.fn(),
      abandon: vi.fn(),
    },
    balletTrainingV3: {
      getSnapshot: vi.fn(),
      recover: vi.fn(),
      setShoeFitProfile: vi.fn(),
    },
    shop: { listItems: vi.fn(), getItem: vi.fn(), purchase: vi.fn() },
    inventory: { listInventory: vi.fn() },
    wardrobe: { getOutfit: vi.fn(), equip: vi.fn(), unequip: vi.fn() },
    profile: { getProfile: vi.fn() },
    academy: { getProgress: vi.fn(), getUniformStatus: vi.fn() },
    persona: { generate: vi.fn().mockResolvedValue(undefined) } as PersonaTextPort,
  };
}

describe('ballet command', () => {
  it('defines status, Academy, activities, practice, class, and V3 training commands', () => {
    expect(balletCommand.definition.options?.map((option) => option.name)).toEqual([
      'status',
      'academy',
      'activities',
      'practice',
      'class',
      'training',
      'recovery',
    ]);
  });

  it('renders persisted training condition and class-cycle state', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'training',
      },
    ]);
    const services = createServices();
    services.balletTrainingV3.getSnapshot.mockResolvedValue({
      skills: {
        balance: 1,
        core_control: 0,
        footwork: 0,
        coordination: 0,
        turn_control: 0,
        jump_control: 0,
        placement: 0,
        musicality: 0,
      },
      condition: {
        energy: 70,
        nutrition: 70,
        fatigue: 10,
        sleepDebt: 0,
        updatedAt: new Date('2026-10-04T12:00:00.000Z'),
      },
      staminaCycle: null,
      setback: {
        status: 'NONE',
        kind: null,
        requiredRehabSessions: 0,
        completedRehabSessions: 0,
        startedAt: null,
        recoveredAt: null,
      },
      shoeFit: null,
    });

    await balletCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.balletTrainingV3.getSnapshot).toHaveBeenCalledWith('222222222222222222');
    expect(editOriginalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            description: expect.stringContaining('fictional gameplay values only'),
          }),
        ],
      }),
    );
  });

  it('routes a recovery action through the idempotent training domain', async () => {
    const { interaction } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'recovery',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'action',
            value: 'REST',
          },
        ],
      },
    ]);
    const services = createServices();
    services.balletTrainingV3.recover.mockResolvedValue({
      action: 'REST',
      replayed: false,
      snapshot: {
        skills: {
          balance: 0,
          core_control: 0,
          footwork: 0,
          coordination: 0,
          turn_control: 0,
          jump_control: 0,
          placement: 0,
          musicality: 0,
        },
        condition: {
          energy: 82,
          nutrition: 70,
          fatigue: 0,
          sleepDebt: 0,
          updatedAt: new Date('2026-10-04T12:00:00.000Z'),
        },
        staminaCycle: null,
        setback: {
          status: 'NONE',
          kind: null,
          requiredRehabSessions: 0,
          completedRehabSessions: 0,
          startedAt: null,
          recoveredAt: null,
        },
        shoeFit: null,
      },
    });

    await balletCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.balletTrainingV3.recover).toHaveBeenCalledWith(
      '111111111111111111',
      '222222222222222222',
      'REST',
    );
  });

  it('starts a persistent class through the Ballet class domain and renders its controls', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'class',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'type',
            value: 'BARRE_FOCUS',
          },
        ],
      },
    ]);
    const services = createServices();
    const classId = '250aad21-50a6-4d43-a450-b2c8f8825070';
    services.balletClass.startOrResume.mockResolvedValue({
      classId,
      discordUserId: '222222222222222222',
      classType: 'BARRE_FOCUS',
      classTypeName: 'Barre Focus',
      academyStageId: 'minis-bambinis',
      academyStageName: 'Minis & Bambinis',
      status: 'PREPARING',
      currentSection: null,
      startedAt: new Date('2026-10-03T12:00:00.000Z'),
      completedAt: null,
      abandonedAt: null,
      currentExerciseIndex: 0,
      curriculum: buildBalletClassCurriculum('minis-bambinis', 'BARRE_FOCUS', classId),
      preparation: [],
      attempts: [],
      review: null,
      replayed: false,
    });

    await balletCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.balletClass.startOrResume).toHaveBeenCalledWith(
      '111111111111111111',
      '222222222222222222',
      'BARRE_FOCUS',
    );
    expect(editOriginalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [expect.objectContaining({ title: expect.stringContaining('Barre Focus') })],
        components: expect.any(Array),
      }),
    );
  });

  it('shows canonical Academy stage milestones and sends allowlisted persona facts', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      { type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND, name: 'academy' },
    ]);
    const services = createServices();
    services.academy.getProgress.mockResolvedValue({
      currentRank: {
        id: 'grade-1',
        title: 'Grade 1',
        description: 'Develop steady barre and foundational technique.',
        requirements: [{ label: 'Reach Ballet level 4', met: true }],
      },
      nextRank: {
        id: 'grade-2',
        title: 'Grade 2',
        description: 'Bring balance and musical phrasing into practice.',
        requirements: [
          { label: 'Reach Ballet level 5', met: false },
          { label: 'Complete Center Practice', met: false },
        ],
      },
      completedRankCount: 3,
    });
    services.academy.getUniformStatus.mockResolvedValue({
      rank: { id: 'grade-1', title: 'Grade 1', description: '', requirements: [] },
      ready: false,
      pointeRequired: false,
      pieces: [],
      look: [],
      optionalRankAccent: {
        label: 'Primary class wrap',
        equippedItemName: null,
        ownedAlternatives: [],
        availableAlternatives: [],
      },
    });

    await balletCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.academy.getProgress).toHaveBeenCalledWith('222222222222222222');
    expect(services.persona.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'ballet',
        action: 'academy_view',
        facts: expect.objectContaining({ academy_stage: 'grade-1', academy_stages_completed: 3 }),
      }),
      '222222222222222222',
      undefined,
    );
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: expect.stringContaining('Maison Noélia · Grade 1'),
          description: expect.stringContaining('○ Reach Ballet level 5'),
        }),
      ],
    });
  });

  it('shows XP and level progress publicly', async () => {
    const { interaction, defer, editOriginalMessage } = createInteraction([
      { type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND, name: 'status' },
    ]);
    const services = createServices();
    services.ballet.getProgress.mockResolvedValue({
      totalXp: 98n,
      level: 1,
      xpToNextLevel: 2n,
      stats: {
        technique: 2,
        flexibility: 0,
        musicality: 0,
        performance: 0,
        pointe: 0,
        stamina: 0,
      },
    });

    await balletCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(services.ballet.getProgress).toHaveBeenCalledWith('222222222222222222');
    expect(defer).toHaveBeenCalledWith();
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: expect.stringContaining(NOELIA_COPY.balletStatusTitle),
          description: 'Ballet Level 1 · 98 XP\n2 XP to the next level.',
        }),
      ],
    });
  });

  it('lists activities with their reward and unlock state', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      { type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND, name: 'activities' },
    ]);
    const services = createServices();
    services.ballet.listActivities.mockResolvedValue([
      {
        code: 'stretching',
        displayName: 'Stretching',
        description: 'A gentle mobility session.',
        category: 'CONDITIONING',
        minimumLevel: 1,
        xpReward: 8n,
        slippersReward: 10n,
        statKey: 'flexibility',
        statGain: 2,
        statRequirements: [],
        requirementMet: true,
        requiredEquippedItemId: null,
        requiredActivityCode: null,
        lockReason: null,
        availability: 'AVAILABLE',
        nextAvailableAt: null,
      },
    ]);

    await balletCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: expect.stringContaining(NOELIA_COPY.balletActivitiesTitle),
          description: `• **Stretching** — 8 XP, ${formatBalance(10n)} · Ready now`,
        }),
      ],
    });
  });

  it('uses the interaction ID for a practice and renders the reward result', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'practice',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'activity',
            value: 'stretching',
          },
        ],
      },
    ]);
    const services = createServices();
    services.ballet.practice.mockResolvedValue({
      activityCode: 'stretching',
      displayName: 'Stretching',
      xpAwarded: 15n,
      slippersAwarded: 20n,
      stat: { key: 'flexibility', gain: 2, value: 12 },
      totalXp: 105n,
      level: 2,
      nextLevelXp: 95n,
      nextAvailableAt: new Date('2026-10-01T12:30:00.000Z'),
      walletBalance: 220n,
      replayed: false,
    });

    await balletCommand.execute({
      client: {} as Eris.Client,
      interaction,
      services,
    });

    expect(services.ballet.practice).toHaveBeenCalledWith(
      '111111111111111111',
      '222222222222222222',
      'stretching',
    );
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: expect.stringContaining(NOELIA_COPY.balletPracticeComplete),
          fields: [{ name: 'flexibility · +2', value: '12/100', inline: true }],
          description: `Stretching · +15 Ballet XP · +${formatBalance(20n)}\nLevel 2 · 105 XP · 95 XP to the next level.`,
        }),
      ],
    });
  });

  it('keeps deterministic reward facts visible when the persona title is generated', async () => {
    const { interaction, editOriginalMessage } = createInteraction([
      {
        type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
        name: 'practice',
        options: [
          {
            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
            name: 'activity',
            value: 'stretching',
          },
        ],
      },
    ]);
    const services = createServices();
    services.persona = {
      generate: vi.fn().mockResolvedValue('Encore, the studio is glowing.'),
    };
    services.ballet.practice.mockResolvedValue({
      activityCode: 'stretching',
      displayName: 'Stretching',
      xpAwarded: 15n,
      slippersAwarded: 20n,
      stat: { key: 'flexibility', gain: 2, value: 12 },
      totalXp: 105n,
      level: 2,
      nextLevelXp: 95n,
      nextAvailableAt: new Date('2026-10-01T12:30:00.000Z'),
      walletBalance: 220n,
      replayed: false,
    });

    await balletCommand.execute({ client: {} as Eris.Client, interaction, services });

    expect(services.persona.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'ballet',
        action: 'practice_complete',
        facts: expect.objectContaining({
          activity: 'stretching',
          xp_gained: '15',
          slippers_gained: '20',
          stat: 'flexibility',
          stat_gain: 2,
          level: 2,
          xp_to_next_level: '95',
        }),
      }),
      '222222222222222222',
      undefined,
    );
    expect(editOriginalMessage).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          title: 'Encore, the studio is glowing.',
          fields: [{ name: 'flexibility · +2', value: '12/100', inline: true }],
          description: `Stretching · +15 Ballet XP · +${formatBalance(20n)}\nLevel 2 · 105 XP · 95 XP to the next level.`,
        }),
      ],
    });
  });
});
