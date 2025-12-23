import type { GoalListItem } from '../model/GoalProjectionState';

type GoalSearchConfig = {
  idField: keyof GoalListItem & string;
  fields: readonly (keyof GoalListItem & string)[];
  storeFields: readonly (keyof GoalListItem & string)[];
  searchOptions: {
    combineWith?: 'AND' | 'OR';
    prefix?: boolean;
    fuzzy?: number;
    tokenize?: (text: string) => string[];
  };
};

/**
 * Search configuration for goals.
 *
 * - Uses the goal id as the document identifier.
 * - Indexes only the summary text for now.
 * - Stores enough fields to render dashboard cards without hitting storage.
 * - Tokenizes into overlapping 3-grams to support infix search (e.g. "odo" in "todo").
 * - Uses a conservative fuzzy match to avoid noisy results.
 */
export const GOAL_SEARCH_CONFIG: GoalSearchConfig = {
  idField: 'id',
  fields: ['summary'],
  storeFields: [
    'id',
    'summary',
    'slice',
    'priority',
    'targetMonth',
    'createdAt',
    'archivedAt',
  ],
  searchOptions: {
    combineWith: 'OR',
    prefix: true,
    fuzzy: 0.3,
    tokenize: (text: string): string[] =>
      text
        .split(/\s+/)
        .flatMap((word) =>
          word.length >= 3 ? (word.match(/.{1,3}/g) ?? [word]) : [word]
        ),
  },
};
