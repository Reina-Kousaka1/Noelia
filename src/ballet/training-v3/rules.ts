import type { BalletExerciseOutcome } from '../class/types.js';
import type {
  BalletConditionSnapshot,
  BalletRecoveryAction,
  BalletShoeFitProfile,
  BalletStaminaCycleSnapshot,
  BalletTrainingSetbackKind,
  BalletTrainingSkill,
  BalletTrainingSkillValues,
} from './types.js';

/** Fictional gameplay tuning. These values are not training or health guidance. */
export const BALLET_TRAINING_V3_RULES = {
  version: 1,
  initialSkill: 0,
  maximumSkill: 100,
  maximumSkillEventsPerDay: 5,
  skillGain: { PERFECT: 2, SUCCESS: 1, SHAKY: 0, FAIL: 0 } satisfies Record<
    BalletExerciseOutcome,
    number
  >,
  initialCondition: { energy: 70, nutrition: 70, fatigue: 10, sleepDebt: 0 },
  recoveryCooldownHours: 2,
  passiveRecovery: {
    energyPerHour: 2,
    fatiguePerHour: 2,
    sleepDebtPerHour: 1,
  },
  exerciseCost: {
    baseEnergy: 3,
    difficultyEnergy: 1,
    nutrition: 2,
    baseFatigue: 3,
    difficultyFatigue: 1,
  },
  conditionScoreModifier: { minimum: -10, maximum: 4 },
  recovery: {
    REST: { energy: 12, nutrition: 0, fatigue: -18, sleepDebt: 0 },
    SLEEP: { energy: 24, nutrition: 0, fatigue: -12, sleepDebt: -24 },
    NOURISH: { energy: 5, nutrition: 22, fatigue: 0, sleepDebt: 0 },
    REHABILITATE: { energy: 6, nutrition: 0, fatigue: -8, sleepDebt: 0 },
  } satisfies Record<BalletRecoveryAction, ConditionDelta>,
  staminaCycle: {
    initialTargetWorkload: 6,
    durationHours: 168,
    minimumTargetWorkload: 1,
    maximumTargetWorkload: 20,
    belowFloorExceptionProbability: 0.000001,
  },
  setback: {
    fatigueThreshold: 85,
    probability: 0.005,
    requiredRehabSessions: 2,
  },
  shoeSize: { minimumEu: 25, maximumEu: 45, stepEu: 0.5 },
} as const;

type ConditionDelta = Readonly<{
  energy: number;
  nutrition: number;
  fatigue: number;
  sleepDebt: number;
}>;

export const TRAINING_SKILL_WEIGHTS: Readonly<
  Record<string, Readonly<Partial<Record<BalletTrainingSkill, number>>>>
> = {
  Pliés: { placement: 3, balance: 1, core_control: 1 },
  Tendus: { footwork: 3, placement: 2, coordination: 1 },
  'Dégagés / Glissés': { footwork: 2, coordination: 2, musicality: 1 },
  'Rond de jambe': { placement: 2, coordination: 2, balance: 1 },
  Fondu: { balance: 2, core_control: 2, placement: 2 },
  Frappé: { footwork: 3, coordination: 2, core_control: 1 },
  'Grands battements': { placement: 2, coordination: 1, balance: 1 },
  'Port de bras': { coordination: 3, placement: 2, musicality: 1 },
  'Centre practice': { balance: 2, core_control: 2, coordination: 2 },
  'Adagio at the barre': { balance: 2, core_control: 2, musicality: 2 },
  Adagio: { balance: 2, core_control: 2, musicality: 2 },
  'Balance work': { balance: 3, core_control: 2, placement: 1 },
  'Pirouette preparation': { turn_control: 3, balance: 2, core_control: 2 },
  Pirouettes: { turn_control: 3, balance: 2, core_control: 2, coordination: 1 },
  'Travelling steps': { footwork: 2, coordination: 3, musicality: 1 },
  'Petit allegro': { jump_control: 2, footwork: 2, coordination: 2 },
  'Jumps / Leaps': { jump_control: 3, coordination: 2, core_control: 1 },
  'Grand allegro': { jump_control: 3, coordination: 2, core_control: 1 },
  Technique: { placement: 2, coordination: 2, footwork: 1 },
  'Original repertoire': { musicality: 2, placement: 2, coordination: 2 },
};

export function createInitialTrainingSkills(): BalletTrainingSkillValues {
  return {
    balance: BALLET_TRAINING_V3_RULES.initialSkill,
    core_control: BALLET_TRAINING_V3_RULES.initialSkill,
    footwork: BALLET_TRAINING_V3_RULES.initialSkill,
    coordination: BALLET_TRAINING_V3_RULES.initialSkill,
    turn_control: BALLET_TRAINING_V3_RULES.initialSkill,
    jump_control: BALLET_TRAINING_V3_RULES.initialSkill,
    placement: BALLET_TRAINING_V3_RULES.initialSkill,
    musicality: BALLET_TRAINING_V3_RULES.initialSkill,
  };
}

export function createInitialCondition(now: Date): BalletConditionSnapshot {
  assertValidDate(now);
  return { ...BALLET_TRAINING_V3_RULES.initialCondition, updatedAt: now };
}

export function recoverConditionOverTime(
  condition: BalletConditionSnapshot,
  now: Date,
): BalletConditionSnapshot {
  assertValidDate(now);
  const elapsedHours = Math.max(
    0,
    Math.floor((now.getTime() - condition.updatedAt.getTime()) / 3_600_000),
  );
  if (elapsedHours === 0) return condition;
  return {
    energy: clamp(
      condition.energy + elapsedHours * BALLET_TRAINING_V3_RULES.passiveRecovery.energyPerHour,
    ),
    nutrition: condition.nutrition,
    fatigue: clamp(
      condition.fatigue - elapsedHours * BALLET_TRAINING_V3_RULES.passiveRecovery.fatiguePerHour,
    ),
    sleepDebt: clamp(
      condition.sleepDebt -
        elapsedHours * BALLET_TRAINING_V3_RULES.passiveRecovery.sleepDebtPerHour,
    ),
    updatedAt: now,
  };
}

export function conditionScoreModifier(condition: BalletConditionSnapshot): number {
  const raw =
    Math.floor((condition.energy - 50) / 20) +
    Math.floor((condition.nutrition - 50) / 25) -
    Math.ceil(condition.fatigue / 25) -
    Math.ceil(condition.sleepDebt / 30);
  return Math.max(
    BALLET_TRAINING_V3_RULES.conditionScoreModifier.minimum,
    Math.min(BALLET_TRAINING_V3_RULES.conditionScoreModifier.maximum, raw),
  );
}

export function applyExerciseCondition(
  current: BalletConditionSnapshot,
  difficulty: number,
  now: Date,
): BalletConditionSnapshot {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    throw new RangeError('Exercise difficulty must be an integer from 1 to 5.');
  }
  const recovered = recoverConditionOverTime(current, now);
  const costs = BALLET_TRAINING_V3_RULES.exerciseCost;
  const fatigue = clamp(
    recovered.fatigue + costs.baseFatigue + difficulty * costs.difficultyFatigue,
  );
  return {
    energy: clamp(recovered.energy - costs.baseEnergy - difficulty * costs.difficultyEnergy),
    nutrition: clamp(recovered.nutrition - costs.nutrition),
    fatigue,
    sleepDebt: clamp(recovered.sleepDebt + (fatigue >= 95 ? 1 : 0)),
    updatedAt: now,
  };
}

export function applyRecoveryAction(
  current: BalletConditionSnapshot,
  action: BalletRecoveryAction,
  now: Date,
): BalletConditionSnapshot {
  const recovered = recoverConditionOverTime(current, now);
  const delta = BALLET_TRAINING_V3_RULES.recovery[action];
  return {
    energy: clamp(recovered.energy + delta.energy),
    nutrition: clamp(recovered.nutrition + delta.nutrition),
    fatigue: clamp(recovered.fatigue + delta.fatigue),
    sleepDebt: clamp(recovered.sleepDebt + delta.sleepDebt),
    updatedAt: now,
  };
}

export function nextStaminaCycle(
  cycleNumber: number,
  previousCompletedWorkload: number,
  now: Date,
  belowFloorRoll: number,
  targetRoll: number,
): BalletStaminaCycleSnapshot {
  assertUnitInterval(belowFloorRoll, 'Stamina floor exception RNG');
  assertUnitInterval(targetRoll, 'Stamina target RNG');
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1)
    throw new RangeError('Cycle number must be positive.');
  if (!Number.isInteger(previousCompletedWorkload) || previousCompletedWorkload < 0) {
    throw new RangeError('Completed workload must be a non-negative integer.');
  }
  assertValidDate(now);
  const config = BALLET_TRAINING_V3_RULES.staminaCycle;
  const normalFloor = Math.max(
    config.minimumTargetWorkload,
    Math.ceil(previousCompletedWorkload * 0.5),
  );
  // The initial cycle is a fixed seed workload. The rare relaxation only
  // applies when adapting a later cycle to a completed prior workload.
  const belowFloorException =
    cycleNumber > 1 &&
    normalFloor > config.minimumTargetWorkload &&
    belowFloorRoll < config.belowFloorExceptionProbability;
  const minimum = belowFloorException
    ? Math.max(config.minimumTargetWorkload, normalFloor - 1)
    : normalFloor;
  const maximum =
    cycleNumber === 1
      ? config.initialTargetWorkload
      : Math.min(
          config.maximumTargetWorkload,
          Math.max(minimum, Math.ceil(previousCompletedWorkload * 1.25)),
        );
  const targetWorkload =
    cycleNumber === 1
      ? config.initialTargetWorkload
      : minimum + Math.floor(targetRoll * (maximum - minimum + 1));
  const durationMs = config.durationHours * 3_600_000;
  return {
    cycleNumber,
    targetWorkload,
    completedWorkload: 0,
    status: 'ACTIVE',
    startedAt: now,
    deadlineAt: new Date(now.getTime() + durationMs),
    completedAt: null,
    belowFloorException,
  };
}

export function shouldCreateTrainingSetback(
  outcome: BalletExerciseOutcome,
  fatigue: number,
  randomValue: number,
): boolean {
  assertUnitInterval(randomValue, 'Training setback RNG');
  return (
    outcome === 'FAIL' &&
    fatigue >= BALLET_TRAINING_V3_RULES.setback.fatigueThreshold &&
    randomValue < BALLET_TRAINING_V3_RULES.setback.probability
  );
}

export function validateShoeFitProfile(
  sizeEu: number,
  fit: string,
  now: Date,
): BalletShoeFitProfile {
  const { minimumEu, maximumEu, stepEu } = BALLET_TRAINING_V3_RULES.shoeSize;
  if (
    !Number.isFinite(sizeEu) ||
    sizeEu < minimumEu ||
    sizeEu > maximumEu ||
    Math.abs((sizeEu - minimumEu) / stepEu - Math.round((sizeEu - minimumEu) / stepEu)) > 1e-9
  ) {
    throw new RangeError(
      `Game shoe-size preference must be ${minimumEu}–${maximumEu} EU in ${stepEu} steps.`,
    );
  }
  if (fit !== 'STANDARD' && fit !== 'NARROW' && fit !== 'WIDE') {
    throw new RangeError('Shoe fit preference must be STANDARD, NARROW, or WIDE.');
  }
  assertValidDate(now);
  return { sizeEu, fit, updatedAt: now };
}

export function skillValuesAfterAttempt(
  current: BalletTrainingSkillValues,
  family: string,
  outcome: BalletExerciseOutcome,
  dailyEventCount: number,
): BalletTrainingSkillValues {
  if (!Number.isInteger(dailyEventCount) || dailyEventCount < 0)
    throw new RangeError('Daily event count must be non-negative.');
  const gain =
    dailyEventCount >= BALLET_TRAINING_V3_RULES.maximumSkillEventsPerDay
      ? 0
      : BALLET_TRAINING_V3_RULES.skillGain[outcome];
  if (gain === 0) return current;
  const weights = TRAINING_SKILL_WEIGHTS[family] ?? { coordination: 1 };
  const eligible = Object.entries(weights).filter(
    ([, weight]) => Number.isInteger(weight) && weight > 0,
  ) as [BalletTrainingSkill, number][];
  if (eligible.length === 0) return current;
  const maximumWeight = Math.max(...eligible.map(([, weight]) => weight));
  const result = { ...current };
  for (const [skill, weight] of eligible) {
    if (weight === maximumWeight)
      result[skill] = clamp(result[skill] + gain, 0, BALLET_TRAINING_V3_RULES.maximumSkill);
  }
  return result;
}

export function trainingSkillContribution(
  skills: BalletTrainingSkillValues | undefined,
  family: string,
): number {
  if (skills === undefined) return 0;
  const weights = TRAINING_SKILL_WEIGHTS[family];
  if (weights === undefined) return 0;
  let total = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (!Number.isInteger(weight) || weight === undefined || weight <= 0) continue;
    total += skills[key as BalletTrainingSkill] * weight;
    weightTotal += weight;
  }
  return weightTotal === 0 ? 0 : total / weightTotal;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function assertUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new RangeError(`${name} must return a finite value in [0, 1).`);
}

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime()))
    throw new RangeError('Training timestamp must be valid.');
}

export const MINOR_TRAINING_SETBACK: BalletTrainingSetbackKind = 'MINOR_TRAINING_STRAIN';
