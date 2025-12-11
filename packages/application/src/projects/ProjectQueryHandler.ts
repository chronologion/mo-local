import type { IQueryHandler } from '../shared/ports/cqrsTypes';
import type { IProjectQueries } from './ports/IProjectQueries';
import type { ProjectListItemDto } from '@mo/interface';
import { ListProjectsQuery } from './queries/ListProjectsQuery';
import { GetProjectByIdQuery } from './queries/GetProjectByIdQuery';
import { SearchProjectsQuery } from './queries/SearchProjectsQuery';

export type ProjectQuery =
  | ListProjectsQuery
  | GetProjectByIdQuery
  | SearchProjectsQuery;

export type ProjectQueryResult =
  | ProjectListItemDto[]
  | ProjectListItemDto
  | null;

export class ProjectQueryHandler implements IQueryHandler<
  ProjectQuery,
  ProjectQueryResult
> {
  constructor(private readonly queries: IProjectQueries) {}

  execute(query: ProjectQuery): Promise<ProjectQueryResult> {
    switch (query.type) {
      case 'ListProjects':
        return this.queries.listProjects(query.filter);
      case 'GetProjectById':
        return this.queries.getProjectById(query.projectId);
      case 'SearchProjects':
        return this.queries.searchProjects(query.term, query.filter);
      default: {
        const _exhaustive: never = query;
        return Promise.reject(
          new Error(
            `Unsupported project query type: ${(query as ProjectQuery).type}`
          )
        );
      }
    }
  }
}
