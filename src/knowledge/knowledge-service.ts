import { createHash } from 'node:crypto';

import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { withTransaction } from '../database/transaction.js';
import { assertDiscordSnowflake } from '../utils/discord-snowflake.js';
import {
  getKnowledgeLesson,
  isKnowledgeDomain,
  KNOWLEDGE_CONFIG,
  KNOWLEDGE_DOMAINS,
  KNOWLEDGE_LESSONS,
  type KnowledgeDomain,
} from './catalog.js';
import {
  KnowledgeAnswerNotFoundError,
  KnowledgeIdempotencyConflictError,
  KnowledgeLessonNotFoundError,
} from './errors.js';
import type {
  KnowledgeAnswerResult,
  KnowledgeLessonProgress,
  KnowledgePort,
  KnowledgeProgress,
} from './types.js';

interface ProgressRow extends QueryResultRow {
  readonly domain: string;
  readonly points: number;
  readonly completed_lessons: number;
}

interface CompletionRow extends QueryResultRow {
  readonly lesson_id: string;
}

interface ExistingAttemptRow extends QueryResultRow {
  readonly discord_user_id: string;
  readonly lesson_id: string;
  readonly request_fingerprint: string;
  readonly outcome: string;
  readonly points_awarded: number;
  readonly points_after: number;
}

interface KnowledgePointsRow extends QueryResultRow {
  readonly points: number;
}

export class KnowledgeService implements KnowledgePort {
  public constructor(private readonly pool: Pool) {}

  public async getProgress(discordUserId: string): Promise<KnowledgeProgress> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const result = await this.pool.query<ProgressRow>(
      `SELECT domain.domain_id AS domain,
              COALESCE(sum(completion.points_awarded), 0)::integer AS points,
              count(completion.lesson_id)::integer AS completed_lessons
       FROM unnest($2::text[]) AS domain(domain_id)
       LEFT JOIN academy_lesson_completions AS completion
         ON completion.discord_user_id = $1 AND completion.domain = domain.domain_id
       GROUP BY domain.domain_id
       ORDER BY domain.domain_id`,
      [discordUserId, [...KNOWLEDGE_DOMAINS]],
    );
    const rowsByDomain = new Map(result.rows.map((row) => [row.domain, row]));
    return {
      domains: KNOWLEDGE_DOMAINS.map((domain) => {
        const row = rowsByDomain.get(domain);
        return {
          domain,
          domainName:
            KNOWLEDGE_LESSONS.find((lesson) => lesson.domain === domain)?.domainName ?? domain,
          points: row?.points ?? 0,
          completedLessons: row?.completed_lessons ?? 0,
          totalLessons: KNOWLEDGE_LESSONS.filter((lesson) => lesson.domain === domain).length,
        };
      }),
    };
  }

  public async listLessons(
    discordUserId: string,
    domain?: KnowledgeDomain,
  ): Promise<readonly KnowledgeLessonProgress[]> {
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    if (domain !== undefined && !isKnowledgeDomain(domain))
      throw new RangeError('Invalid knowledge domain.');
    const result = await this.pool.query<CompletionRow>(
      `SELECT lesson_id
       FROM academy_lesson_completions
       WHERE discord_user_id = $1 AND ($2::text IS NULL OR domain = $2)
       ORDER BY completed_at, lesson_id`,
      [discordUserId, domain ?? null],
    );
    const completed = new Set(result.rows.map((row) => row.lesson_id));
    return KNOWLEDGE_LESSONS.filter(
      (lesson) => domain === undefined || lesson.domain === domain,
    ).map((lesson) => ({
      lessonId: lesson.id,
      title: lesson.title,
      domain: lesson.domain,
      completed: completed.has(lesson.id),
    }));
  }

  public async answer(
    interactionId: string,
    discordUserId: string,
    lessonId: string,
    answerId: string,
  ): Promise<KnowledgeAnswerResult> {
    assertDiscordSnowflake(interactionId, 'Discord interaction ID');
    assertDiscordSnowflake(discordUserId, 'Discord user ID');
    const lesson = getKnowledgeLesson(lessonId);
    if (lesson === undefined) throw new KnowledgeLessonNotFoundError();
    if (!lesson.answers.some((answer) => answer.id === answerId)) {
      throw new KnowledgeAnswerNotFoundError();
    }
    const fingerprint = createHash('sha256')
      .update(`${discordUserId}\u0000${lessonId}\u0000${answerId}`)
      .digest('hex');

    return withTransaction(this.pool, async (client) => {
      await this.lockInteraction(client, interactionId);
      await this.lockUser(client, discordUserId);
      const previous = await this.findAttempt(client, interactionId);
      if (previous !== undefined) {
        if (
          previous.discord_user_id !== discordUserId ||
          previous.lesson_id !== lessonId ||
          previous.request_fingerprint !== fingerprint
        ) {
          throw new KnowledgeIdempotencyConflictError();
        }
        return this.toResult(lesson.id, lesson.title, lesson.domain, previous, true);
      }

      const completion = await client.query(
        `SELECT 1 FROM academy_lesson_completions
         WHERE discord_user_id = $1 AND lesson_id = $2`,
        [discordUserId, lessonId],
      );
      const existingPoints = await this.getDomainPoints(client, discordUserId, lesson.domain);
      const alreadyCompleted = completion.rows.length > 0;
      const correct = !alreadyCompleted && answerId === lesson.correctAnswerId;
      const outcome = alreadyCompleted ? 'ALREADY_COMPLETED' : correct ? 'CORRECT' : 'INCORRECT';
      const pointsAwarded = correct ? KNOWLEDGE_CONFIG.correctAnswerPoints : 0;
      const pointsAfter = existingPoints + pointsAwarded;

      await client.query(
        `INSERT INTO academy_lesson_attempts (
           interaction_id, discord_user_id, lesson_id, domain, answer_id,
           request_fingerprint, outcome, points_awarded, points_after
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          interactionId,
          discordUserId,
          lessonId,
          lesson.domain,
          answerId,
          fingerprint,
          outcome,
          pointsAwarded,
          pointsAfter,
        ],
      );
      if (correct) {
        await client.query(
          `INSERT INTO academy_lesson_completions (
             discord_user_id, lesson_id, domain, completion_interaction_id, points_awarded
           ) VALUES ($1, $2, $3, $4, $5)`,
          [discordUserId, lessonId, lesson.domain, interactionId, pointsAwarded],
        );
      }

      return {
        lessonId,
        title: lesson.title,
        domain: lesson.domain,
        outcome,
        pointsAwarded,
        pointsAfter,
        replayed: false,
      };
    });
  }

  private async lockInteraction(client: PoolClient, interactionId: string): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [interactionId]);
  }

  private async lockUser(client: PoolClient, discordUserId: string): Promise<void> {
    await client.query(
      `INSERT INTO discord_users (discord_user_id)
       VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING`,
      [discordUserId],
    );
    const user = await client.query(
      `SELECT discord_user_id FROM discord_users
       WHERE discord_user_id = $1 FOR UPDATE`,
      [discordUserId],
    );
    if (user.rows.length === 0) throw new Error('Discord user could not be locked for a lesson.');
  }

  private async findAttempt(
    client: PoolClient,
    interactionId: string,
  ): Promise<ExistingAttemptRow | undefined> {
    const result = await client.query<ExistingAttemptRow>(
      `SELECT discord_user_id, lesson_id, request_fingerprint, outcome,
              points_awarded, points_after
       FROM academy_lesson_attempts WHERE interaction_id = $1`,
      [interactionId],
    );
    return result.rows[0];
  }

  private async getDomainPoints(
    client: PoolClient,
    discordUserId: string,
    domain: KnowledgeDomain,
  ): Promise<number> {
    const result = await client.query<KnowledgePointsRow>(
      `SELECT COALESCE(sum(points_awarded), 0)::integer AS points
       FROM academy_lesson_completions
       WHERE discord_user_id = $1 AND domain = $2`,
      [discordUserId, domain],
    );
    return result.rows[0]?.points ?? 0;
  }

  private toResult(
    lessonId: string,
    title: string,
    domain: KnowledgeDomain,
    row: ExistingAttemptRow,
    replayed: boolean,
  ): KnowledgeAnswerResult {
    if (
      row.outcome !== 'CORRECT' &&
      row.outcome !== 'INCORRECT' &&
      row.outcome !== 'ALREADY_COMPLETED'
    ) {
      throw new Error('Database returned an unsupported Academy lesson result.');
    }
    return {
      lessonId,
      title,
      domain,
      outcome: row.outcome,
      pointsAwarded: row.points_awarded,
      pointsAfter: row.points_after,
      replayed,
    };
  }
}
