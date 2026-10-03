import { describe, expect, it } from 'vitest';

import {
  getKnowledgeLesson,
  KNOWLEDGE_CONFIG,
  KNOWLEDGE_DOMAINS,
  KNOWLEDGE_LESSONS,
  listKnowledgeLessons,
} from '../../src/knowledge/catalog.js';

describe('Academy Knowledge catalog', () => {
  it('covers the eight separate study domains with stable unique lessons', () => {
    expect(KNOWLEDGE_DOMAINS).toHaveLength(8);
    expect(new Set(KNOWLEDGE_LESSONS.map((lesson) => lesson.id)).size).toBe(
      KNOWLEDGE_LESSONS.length,
    );
    for (const domain of KNOWLEDGE_DOMAINS) {
      expect(listKnowledgeLessons(domain)).toHaveLength(1);
    }
  });

  it('keeps each question answerable and its explanation in the lesson content', () => {
    for (const lesson of KNOWLEDGE_LESSONS) {
      expect(lesson.content.length).toBeGreaterThan(30);
      expect(lesson.question.length).toBeGreaterThan(10);
      expect(lesson.answers).toHaveLength(3);
      expect(lesson.answers.some((answer) => answer.id === lesson.correctAnswerId)).toBe(true);
      expect(lesson.explanation.length).toBeGreaterThan(10);
    }
  });

  it('marks Maison Noélia history as fictional and keeps reward tuning centralized', () => {
    const lesson = getKnowledgeLesson('academy-history-origin-01');
    expect(lesson?.content).toContain('fictional history');
    expect(lesson?.explanation).toContain('fictional Noélia lore');
    expect(KNOWLEDGE_CONFIG.correctAnswerPoints).toBeGreaterThan(0);
  });

  it('does not place shop or currency values in the Academy Knowledge lessons', () => {
    expect(
      KNOWLEDGE_LESSONS.every((lesson) => !/Ballet Slippers|wallet|price/i.test(lesson.content)),
    ).toBe(true);
  });
});
