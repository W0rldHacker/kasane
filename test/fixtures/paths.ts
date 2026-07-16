export const validPathFixtures = [
  { path: '', segments: [] },
  { path: 'a.b.c', segments: ['a', 'b', 'c'] },
  { path: 'a\\.b.c', segments: ['a.b', 'c'] },
  { path: 'a\\\\b.c', segments: ['a\\b', 'c'] },
  { path: 'items.0', segments: ['items', '0'] },
] as const;

export const invalidPathFixtures = [
  '.a',
  'a.',
  'a..b',
  'a\\',
  'a\\q',
] as const;
