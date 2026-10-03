import { getAssessmentKnowledgeDomains, getAcademyStageDefinition } from '../academy.js';
import { KNOWLEDGE_LESSONS } from '../../knowledge/catalog.js';
import type { AcademyAssessmentQuestionSnapshot } from './types.js';

/**
 * Selects content from the existing Knowledge catalog without recording a
 * lesson completion or awarding Knowledge points. Selection rotates
 * deterministically by attempt number and is snapshotted by the service.
 */
export function buildAssessmentQuestions(
  targetStageId: string,
  attemptNumber: number,
): readonly AcademyAssessmentQuestionSnapshot[] {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    throw new RangeError('Assessment attempt number must be a positive integer.');
  }
  if (getAcademyStageDefinition(targetStageId) === undefined) {
    throw new Error(`Unknown Academy stage: ${targetStageId}`);
  }

  return getAssessmentKnowledgeDomains(targetStageId).map((domain) => {
    const lessons = KNOWLEDGE_LESSONS.filter((lesson) => lesson.domain === domain);
    if (lessons.length === 0) throw new Error(`No Knowledge lesson exists for ${domain}.`);
    const lesson = lessons[(attemptNumber - 1) % lessons.length];
    if (lesson === undefined) throw new Error(`No Knowledge lesson exists for ${domain}.`);
    return {
      id: lesson.id,
      domain: lesson.domain,
      domainName: lesson.domainName,
      title: lesson.title,
      question: lesson.question,
      answers: lesson.answers,
      correctAnswerId: lesson.correctAnswerId,
      explanation: lesson.explanation,
    };
  });
}
