export const KNOWLEDGE_DOMAINS = [
  'musicality',
  'ballet_french',
  'ballet_theory',
  'ballet_history',
  'french_history_culture',
  'academy_history',
  'repertoire_studies',
  'academy_etiquette',
] as const;

export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

export interface KnowledgeAnswer {
  readonly id: string;
  readonly label: string;
}

export interface KnowledgeLesson {
  readonly id: string;
  readonly domain: KnowledgeDomain;
  readonly domainName: string;
  readonly title: string;
  readonly content: string;
  readonly question: string;
  readonly answers: readonly KnowledgeAnswer[];
  readonly correctAnswerId: string;
  readonly explanation: string;
}

export const KNOWLEDGE_CONFIG = {
  /** Initial reward, centralized and subject to future balancing review. */
  correctAnswerPoints: 5,
} as const;

export const KNOWLEDGE_LESSONS: readonly KnowledgeLesson[] = [
  {
    id: 'musicality-phrasing-01',
    domain: 'musicality',
    domainName: 'Musicality',
    title: 'Hearing the phrase',
    content:
      'A musical phrase is a shaped musical idea. Dancers listen for how it begins, develops, and settles instead of treating every count as identical.',
    question: 'What helps a dancer shape a musical phrase?',
    answers: [
      { id: 'a', label: 'Listening to the music’s rise and resolution' },
      { id: 'b', label: 'Making every movement exactly the same length' },
      { id: 'c', label: 'Ignoring the music once the steps are memorised' },
    ],
    correctAnswerId: 'a',
    explanation: 'Musical phrasing follows the shape and intention of the music.',
  },
  {
    id: 'ballet-french-plie-01',
    domain: 'ballet_french',
    domainName: 'Ballet French',
    title: 'A plié',
    content:
      'Plié is a French ballet term for a bending action of the knees, performed with control and alignment.',
    question: 'What does plié describe?',
    answers: [
      { id: 'a', label: 'A small jump' },
      { id: 'b', label: 'A bending of the knees' },
      { id: 'c', label: 'A turn on one foot' },
    ],
    correctAnswerId: 'b',
    explanation: 'Plié means a bending action; the movement stays controlled and aligned.',
  },
  {
    id: 'ballet-theory-first-position-01',
    domain: 'ballet_theory',
    domainName: 'Ballet Theory',
    title: 'A stable starting position',
    content:
      'Ballet positions are named reference points. A dancer should use a comfortable, controlled turnout rather than force a shape.',
    question: 'What should guide a dancer’s turnout in a position?',
    answers: [
      { id: 'a', label: 'Comfortable control and alignment' },
      { id: 'b', label: 'Forcing the feet into a straight line' },
      { id: 'c', label: 'Copying the widest turnout in the room' },
    ],
    correctAnswerId: 'a',
    explanation: 'A safe, controlled position is more important than forcing turnout.',
  },
  {
    id: 'ballet-history-styles-01',
    domain: 'ballet_history',
    domainName: 'Ballet History',
    title: 'Many ballet traditions',
    content:
      'Ballet has developed across eras and places. Its history is a collection of changing artistic traditions, not one unchanging style.',
    question: 'How is ballet history best understood?',
    answers: [
      { id: 'a', label: 'As one style that never changed' },
      { id: 'b', label: 'As traditions that developed across eras and places' },
      { id: 'c', label: 'As only a list of steps' },
    ],
    correctAnswerId: 'b',
    explanation: 'Ballet history includes many eras, places, and evolving traditions.',
  },
  {
    id: 'french-culture-context-01',
    domain: 'french_history_culture',
    domainName: 'French History & Culture',
    title: 'Language in the studio',
    content:
      'French vocabulary is common in ballet studios, while teachers may explain each term in the language their dancers understand.',
    question: 'Does ballet progress depend on already speaking French?',
    answers: [
      { id: 'a', label: 'Yes, French fluency is required' },
      { id: 'b', label: 'No, terms can be explained and translated' },
      { id: 'c', label: 'Only for beginner classes' },
    ],
    correctAnswerId: 'b',
    explanation:
      'Ballet vocabulary can be learned with explanations; fluency is not a prerequisite.',
  },
  {
    id: 'academy-history-origin-01',
    domain: 'academy_history',
    domainName: 'Academy History',
    title: 'The original studio',
    content:
      'In Noélia’s fictional history, Maison Noélia began as the Académie de Ballet Noélia. The original Académie remains at the heart of the Maison.',
    question: 'What was the institution’s original name in Noélia lore?',
    answers: [
      { id: 'a', label: 'Maison Voltige' },
      { id: 'b', label: 'Académie de Ballet Noélia' },
      { id: 'c', label: 'The Paris Royal Academy' },
    ],
    correctAnswerId: 'b',
    explanation: 'This is original fictional Noélia lore, not a real academy.',
  },
  {
    id: 'repertoire-interpretation-01',
    domain: 'repertoire_studies',
    domainName: 'Repertoire Studies',
    title: 'Beyond the steps',
    content:
      'Studying a role means considering its musical phrasing, intention, and place in the work, alongside the steps themselves.',
    question: 'What can help a dancer interpret a role?',
    answers: [
      { id: 'a', label: 'Only performing the steps as quickly as possible' },
      { id: 'b', label: 'Considering music, intention, and the role’s place in the work' },
      { id: 'c', label: 'Ignoring the rest of the work' },
    ],
    correctAnswerId: 'b',
    explanation: 'Interpretation brings steps together with musical and dramatic context.',
  },
  {
    id: 'academy-etiquette-correction-01',
    domain: 'academy_etiquette',
    domainName: 'Academy Etiquette',
    title: 'Receiving a correction',
    content:
      'A correction is a practical note for the next attempt. Listen, ask for clarification when needed, and try it without comparing yourself to others.',
    question: 'What is a useful response to a correction?',
    answers: [
      { id: 'a', label: 'Listen, clarify if needed, and try the adjustment' },
      { id: 'b', label: 'Treat it as a judgement of personal worth' },
      { id: 'c', label: 'Stop practising permanently' },
    ],
    correctAnswerId: 'a',
    explanation: 'Corrections address the work and support the next attempt.',
  },
];

const lessonsById = new Map(KNOWLEDGE_LESSONS.map((lesson) => [lesson.id, lesson]));

export function getKnowledgeLesson(lessonId: string): KnowledgeLesson | undefined {
  return lessonsById.get(lessonId);
}

export function listKnowledgeLessons(domain?: KnowledgeDomain): readonly KnowledgeLesson[] {
  return domain === undefined
    ? KNOWLEDGE_LESSONS
    : KNOWLEDGE_LESSONS.filter((lesson) => lesson.domain === domain);
}

export function isKnowledgeDomain(value: string): value is KnowledgeDomain {
  return (KNOWLEDGE_DOMAINS as readonly string[]).includes(value);
}
