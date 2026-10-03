export interface AcademyHistoryChapter {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/** Fictional Maison Noélia lore; intentionally separate from gameplay rules. */
export const ACADEMY_HISTORY: readonly AcademyHistoryChapter[] = [
  {
    id: 'the-original-studio',
    title: 'The Original Studio',
    body: 'The story began in a modest studio known as the Académie de Ballet Noélia. Its first promise was simple: a thoughtful place to learn, practise, and return to the barre with patience.',
  },
  {
    id: 'the-first-academy-classes',
    title: 'The First Academy Classes',
    body: 'The earliest classes centred on foundations: posture, musical listening, careful footwork, and the shared rituals of a welcoming studio.',
  },
  {
    id: 'the-growth-of-the-academie',
    title: 'The Growth of the Académie',
    body: 'As more dancers joined, the Académie gathered teachers, rehearsal rooms, and a growing repertoire while keeping its original studio at the heart of the school.',
  },
  {
    id: 'expansion-of-the-curriculum',
    title: 'Expansion of the Curriculum',
    body: 'Training gradually grew to include conditioning and gymnastics, musicality, ballet theory and history, French ballet vocabulary, French culture, repertoire studies, and performance preparation.',
  },
  {
    id: 'the-first-etoile',
    title: 'The First Étoile',
    body: 'Maison lore remembers its first Étoile not as a perfect dancer, but as an artist who paired disciplined practice with generosity toward every classmate.',
  },
  {
    id: 'the-birth-of-maison-noelia',
    title: 'The Birth of Maison Noélia',
    body: 'The Académie became Maison Noélia — Académie de Ballet as its work widened beyond classes into study, rehearsal, wardrobe, and performance. The original Académie remained the Maison’s heart.',
  },
  {
    id: 'maison-noelia-today',
    title: 'Maison Noélia Today',
    body: 'Today the Maison is imagined as a home for a long creative journey: from first pliés to repertoire, recitals, and the possibility of a professional career beyond Academy training.',
  },
];
