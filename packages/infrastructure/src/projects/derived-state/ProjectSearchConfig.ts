import type { ProjectListItem } from '../projections/model/ProjectProjectionState';

type ProjectSearchConfig = {
  idField: keyof ProjectListItem & string;
  fields: readonly (keyof ProjectListItem & string)[];
  storeFields: readonly (keyof ProjectListItem & string)[];
  searchOptions: {
    prefix?: boolean;
    fuzzy?: number;
  };
};

/**
 * Search configuration for projects.
 *
 * - Uses the project id as the document identifier.
 * - Indexes both name and description.
 * - Stores timeline and linkage fields so cards can render without extra queries.
 * - Keeps fuzzy matching modest to prefer precise matches over loose noise.
 */
export const PROJECT_SEARCH_CONFIG: ProjectSearchConfig = {
  idField: 'id',
  fields: ['name', 'description'],
  storeFields: [
    'id',
    'name',
    'status',
    'startDate',
    'targetDate',
    'description',
    'goalId',
    'createdAt',
    'updatedAt',
    'archivedAt',
  ],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
  },
};
