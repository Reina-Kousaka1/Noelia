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
    id: 'musicality-counts-01',
    domain: 'musicality',
    domainName: 'Musicality',
    title: 'Counts and listening',
    content:
      'Counts can help a class stay together, but listening to the music matters too. A dancer can keep the count while noticing accents, pauses, and changes in energy.',
    question: 'What is a useful relationship between counts and music?',
    answers: [
      { id: 'a', label: 'Counts support timing while listening shapes the movement' },
      { id: 'b', label: 'Counts mean the music can be ignored' },
      { id: 'c', label: 'Every beat must have an identical movement' },
    ],
    correctAnswerId: 'a',
    explanation: 'Counts help with shared timing; musical listening adds phrasing and nuance.',
  },
  {
    id: 'musicality-tempo-01',
    domain: 'musicality',
    domainName: 'Musicality',
    title: 'Tempo and control',
    content:
      'Tempo is the pace of the music. Changing tempo can change how a movement feels, but control and clear timing remain important at every pace.',
    question: 'When the tempo changes, what should a dancer preserve?',
    answers: [
      { id: 'a', label: 'Control and a clear relationship to the music' },
      { id: 'b', label: 'The same speed regardless of the music' },
      { id: 'c', label: 'As much rushing as possible' },
    ],
    correctAnswerId: 'a',
    explanation: 'Tempo affects pace; dancers still aim for controlled, musical timing.',
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
    id: 'ballet-french-tendu-01',
    domain: 'ballet_french',
    domainName: 'Ballet French',
    title: 'A tendu',
    content:
      'In a tendu, the working foot brushes along the floor to a pointed position while the supporting leg remains steady.',
    question: 'What is the foot’s relationship to the floor in a tendu?',
    answers: [
      { id: 'a', label: 'It brushes along the floor' },
      { id: 'b', label: 'It leaves the floor in a jump' },
      { id: 'c', label: 'It stays completely still' },
    ],
    correctAnswerId: 'a',
    explanation:
      'Tendu describes a stretched, brushed action with the foot travelling along the floor.',
  },
  {
    id: 'ballet-french-releve-01',
    domain: 'ballet_french',
    domainName: 'Ballet French',
    title: 'A relevé',
    content:
      'Relevé describes rising, commonly onto demi-pointe or pointe when appropriate to the dancer and exercise. The term alone does not mean that pointe shoes are required.',
    question: 'What action does relevé describe?',
    answers: [
      { id: 'a', label: 'Rising upward' },
      { id: 'b', label: 'A floor-level slide' },
      { id: 'c', label: 'A travelling jump' },
    ],
    correctAnswerId: 'a',
    explanation:
      'Relevé means rising; equipment and level depend on the actual class requirements.',
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
    id: 'ballet-theory-barre-01',
    domain: 'ballet_theory',
    domainName: 'Ballet Theory',
    title: 'The barre as support',
    content:
      'The barre offers light support during exercises. It can help a dancer focus on placement and coordination; it is not something to pull against to force a position.',
    question: 'How should the barre be used in class?',
    answers: [
      { id: 'a', label: 'As light support while maintaining one’s own control' },
      { id: 'b', label: 'To pull the body into a forced turnout' },
      { id: 'c', label: 'As a replacement for balance' },
    ],
    correctAnswerId: 'a',
    explanation:
      'The barre supports practice; the dancer still works with their own alignment and control.',
  },
  {
    id: 'ballet-theory-alignment-01',
    domain: 'ballet_theory',
    domainName: 'Ballet Theory',
    title: 'Working alignment',
    content:
      'Alignment is the organised relationship of body parts during a movement. It can change with the step, so dancers practise noticing balance and control rather than holding one rigid shape.',
    question: 'What does useful alignment support?',
    answers: [
      { id: 'a', label: 'Balanced, controlled movement' },
      { id: 'b', label: 'A rigid pose in every step' },
      { id: 'c', label: 'Copying another dancer regardless of comfort' },
    ],
    correctAnswerId: 'a',
    explanation: 'Alignment helps organise movement and balance; it is not a single frozen pose.',
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
    id: 'ballet-history-context-01',
    domain: 'ballet_history',
    domainName: 'Ballet History',
    title: 'Reading a dance in context',
    content:
      'A ballet can reflect the artistic conventions and audiences of its time. Learning about context helps explain why styles and stage practices change.',
    question: 'Why consider the context of a historical ballet?',
    answers: [
      { id: 'a', label: 'It can help explain changing styles and conventions' },
      { id: 'b', label: 'It proves every era danced identically' },
      { id: 'c', label: 'It removes the need to observe the work' },
    ],
    correctAnswerId: 'a',
    explanation: 'Context can illuminate how artistic conventions and audiences shape dance.',
  },
  {
    id: 'ballet-history-traditions-01',
    domain: 'ballet_history',
    domainName: 'Ballet History',
    title: 'Many traditions',
    content:
      'Ballet is practised and reimagined in many places. A thoughtful history makes room for different artists, communities, and traditions rather than treating one style as universal.',
    question: 'What makes a ballet history more inclusive?',
    answers: [
      { id: 'a', label: 'Recognising multiple places, artists, and traditions' },
      { id: 'b', label: 'Calling one style the only authentic form' },
      { id: 'c', label: 'Leaving out changes over time' },
    ],
    correctAnswerId: 'a',
    explanation: 'Ballet history is richer when it recognises varied artists and traditions.',
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
    id: 'french-culture-translation-01',
    domain: 'french_history_culture',
    domainName: 'French History & Culture',
    title: 'Learning a borrowed term',
    content:
      'A French ballet term can be useful shorthand in an international studio. A clear teacher can still explain what the movement asks for in plain language.',
    question: 'What should happen when a dancer is unsure of a French term?',
    answers: [
      { id: 'a', label: 'Ask for a clear explanation or translation' },
      { id: 'b', label: 'Pretend to understand and guess' },
      { id: 'c', label: 'Assume French fluency is required' },
    ],
    correctAnswerId: 'a',
    explanation: 'Terminology should help communication; asking for an explanation is welcome.',
  },
  {
    id: 'french-culture-art-01',
    domain: 'french_history_culture',
    domainName: 'French History & Culture',
    title: 'Culture beyond vocabulary',
    content:
      'Studying culture means asking how language, art, institutions, and communities shape creative work. It is broader than memorising foreign words.',
    question: 'What can cultural study add to ballet learning?',
    answers: [
      { id: 'a', label: 'Context for how creative traditions develop' },
      { id: 'b', label: 'A requirement to speak another language' },
      { id: 'c', label: 'A rule that all dancers share one background' },
    ],
    correctAnswerId: 'a',
    explanation:
      'Cultural context helps learners appreciate how art and communities influence one another.',
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
    id: 'academy-history-growth-01',
    domain: 'academy_history',
    domainName: 'Academy History',
    title: 'A growing curriculum',
    content:
      'In Noélia lore, the Académie grew its curriculum while keeping the original studio at its heart. New subjects were added to support a wider creative journey.',
    question: 'What stayed at the heart of the growing Académie?',
    answers: [
      { id: 'a', label: 'The original studio and its welcoming foundations' },
      { id: 'b', label: 'A real-world royal title' },
      { id: 'c', label: 'A rule that only advanced dancers belong' },
    ],
    correctAnswerId: 'a',
    explanation: 'The original studio remains central in Noélia’s fictional history.',
  },
  {
    id: 'academy-history-maison-01',
    domain: 'academy_history',
    domainName: 'Academy History',
    title: 'From Académie to Maison',
    content:
      'Maison Noélia — Académie de Ballet is the fictional institution’s later name, reflecting a home for study, rehearsal, wardrobe, and performance as well as classes.',
    question: 'What does “Maison” represent in Noélia’s story?',
    answers: [
      { id: 'a', label: 'A wider creative home built around the original Académie' },
      { id: 'b', label: 'A real certification body' },
      { id: 'c', label: 'A replacement for ballet training' },
    ],
    correctAnswerId: 'a',
    explanation: 'Maison Noélia is original fictional lore, not a real-world certification.',
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
    id: 'repertoire-observation-01',
    domain: 'repertoire_studies',
    domainName: 'Repertoire Studies',
    title: 'Observe the whole scene',
    content:
      'When studying a variation, notice more than the steps: where it sits in the work, how the music is shaped, and what the character or performer is communicating.',
    question: 'What is useful to observe when studying a variation?',
    answers: [
      { id: 'a', label: 'Steps, musical shape, and dramatic context' },
      { id: 'b', label: 'Only the costume colour' },
      { id: 'c', label: 'Only how quickly the dancer moves' },
    ],
    correctAnswerId: 'a',
    explanation: 'Repertoire study brings movement together with musical and dramatic context.',
  },
  {
    id: 'repertoire-rehearsal-01',
    domain: 'repertoire_studies',
    domainName: 'Repertoire Studies',
    title: 'Purposeful rehearsal',
    content:
      'A rehearsal can focus on one clear question at a time: timing, transitions, spacing, or intention. Specific attention makes practice easier to review.',
    question: 'What makes a rehearsal focus useful?',
    answers: [
      { id: 'a', label: 'Choosing a clear aspect to observe and improve' },
      { id: 'b', label: 'Repeating everything without noticing changes' },
      { id: 'c', label: 'Avoiding feedback and reflection' },
    ],
    correctAnswerId: 'a',
    explanation: 'A clear rehearsal focus helps dancers notice what changed between attempts.',
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
  {
    id: 'academy-etiquette-space-01',
    domain: 'academy_etiquette',
    domainName: 'Academy Etiquette',
    title: 'Sharing studio space',
    content:
      'Dancers share barre and floor space. Looking around, leaving room for others, and following the teacher’s traffic directions help the class work safely together.',
    question: 'What supports a considerate studio?',
    answers: [
      { id: 'a', label: 'Awareness of spacing and other dancers' },
      { id: 'b', label: 'Claiming as much floor as possible' },
      { id: 'c', label: 'Ignoring class directions' },
    ],
    correctAnswerId: 'a',
    explanation: 'Studio awareness helps everyone share the space and follow the exercise.',
  },
  {
    id: 'academy-etiquette-rehearsal-01',
    domain: 'academy_etiquette',
    domainName: 'Academy Etiquette',
    title: 'Rehearsal readiness',
    content:
      'Being ready for rehearsal includes arriving with needed items, listening for changes, and treating shared work with care. It is about supporting the ensemble, not perfection.',
    question: 'What is part of rehearsal readiness?',
    answers: [
      { id: 'a', label: 'Listening and helping the ensemble stay organised' },
      { id: 'b', label: 'Expecting every rehearsal to be flawless' },
      { id: 'c', label: 'Changing spacing without telling anyone' },
    ],
    correctAnswerId: 'a',
    explanation: 'Prepared, attentive rehearsal habits make shared work more considerate.',
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
