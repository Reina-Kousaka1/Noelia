import type { CreateModerationCaseInput, ModerationAction, ModerationSource } from './case.js';

export const MODERATION_OUTCOMES = ['SUCCEEDED', 'FAILED', 'UNKNOWN'] as const;
export type ModerationActionOutcome = (typeof MODERATION_OUTCOMES)[number];

export interface ModerationCaseRecord {
  readonly caseId: string;
  readonly guildId: string;
  readonly targetUserId: string;
  readonly actorUserId: string;
  readonly action: ModerationAction;
  readonly source: ModerationSource;
  readonly reason: string | null;
  readonly occurredAt: Date;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  /** Null means no final Discord outcome was durably recorded. */
  readonly outcome: ModerationActionOutcome | null;
  readonly outcomeCode: string | null;
  readonly outcomeRecordedAt: Date | null;
}

export interface ModerationCasePage {
  readonly cases: readonly ModerationCaseRecord[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCases: number;
  readonly totalPages: number;
}

export interface ModerationOutcomeResult {
  readonly outcome: ModerationActionOutcome;
  readonly outcomeCode: string | null;
  readonly replayed: boolean;
}

export interface ModerationCaseAttemptResult {
  readonly case: ModerationCaseRecord;
  readonly created: boolean;
}

export interface ModerationPort {
  createAttempt(input: CreateModerationCaseInput): Promise<ModerationCaseAttemptResult>;
  recordOutcome(
    caseId: string,
    outcome: ModerationActionOutcome,
    outcomeCode?: string | null,
  ): Promise<ModerationOutcomeResult>;
  getCase(guildId: string, caseId: string): Promise<ModerationCaseRecord | null>;
  listCases(
    guildId: string,
    targetUserId: string,
    page: number,
    action?: ModerationAction,
  ): Promise<ModerationCasePage>;
}
