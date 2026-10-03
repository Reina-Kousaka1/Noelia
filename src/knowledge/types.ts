import type { KnowledgeDomain } from './catalog.js';

export interface KnowledgeLessonProgress {
  readonly lessonId: string;
  readonly title: string;
  readonly domain: KnowledgeDomain;
  readonly completed: boolean;
}

export interface KnowledgeProgress {
  readonly domains: readonly {
    readonly domain: KnowledgeDomain;
    readonly domainName: string;
    readonly points: number;
    readonly completedLessons: number;
    readonly totalLessons: number;
  }[];
}

export interface KnowledgeAnswerResult {
  readonly lessonId: string;
  readonly title: string;
  readonly domain: KnowledgeDomain;
  readonly outcome: 'CORRECT' | 'INCORRECT' | 'ALREADY_COMPLETED';
  readonly pointsAwarded: number;
  readonly pointsAfter: number;
  readonly replayed: boolean;
}

export interface KnowledgePort {
  getProgress(discordUserId: string): Promise<KnowledgeProgress>;
  listLessons(
    discordUserId: string,
    domain?: KnowledgeDomain,
  ): Promise<readonly KnowledgeLessonProgress[]>;
  answer(
    interactionId: string,
    discordUserId: string,
    lessonId: string,
    answerId: string,
  ): Promise<KnowledgeAnswerResult>;
}
