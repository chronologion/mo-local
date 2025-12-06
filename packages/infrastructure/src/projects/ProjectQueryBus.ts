import type { ProjectQueries } from './ProjectQueries';
import type { ProjectListItem } from './ProjectProjectionState';
import { SimpleBus } from '@mo/application';

export type ListProjectsQuery = {
  type: 'ListProjects';
  filter?: { status?: string; goalId?: string | null };
};
export type GetProjectByIdQuery = { type: 'GetProjectById'; projectId: string };
export type SearchProjectsQuery = {
  type: 'SearchProjects';
  term: string;
  filter?: { status?: string; goalId?: string | null };
};

export type ProjectQueryResult = ProjectListItem[] | ProjectListItem | null;

export type ProjectQuery =
  | ListProjectsQuery
  | GetProjectByIdQuery
  | SearchProjectsQuery;

export const registerProjectQueryHandlers = (
  bus: SimpleBus<ProjectQuery, ProjectQueryResult>,
  queries: ProjectQueries
): void => {
  bus.register('ListProjects', async (query: ListProjectsQuery) => {
    return queries.listProjects(query.filter);
  });
  bus.register('GetProjectById', async (query: GetProjectByIdQuery) => {
    return queries.getProjectById(query.projectId);
  });
  bus.register('SearchProjects', async (query: SearchProjectsQuery) => {
    return queries.searchProjects(query.term, query.filter);
  });
};
