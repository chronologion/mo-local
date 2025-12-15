import type { IQueryHandler } from '../shared/ports/cqrsTypes';
import type { IProjectReadModel } from './ports/IProjectReadModel';
import type { ProjectListItemDto } from './dtos';
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
  constructor(private readonly readModel: IProjectReadModel) {}

  execute(query: ProjectQuery): Promise<ProjectQueryResult> {
    switch (query.type) {
      case 'ListProjects':
        return this.readModel.list(query.filter);
      case 'GetProjectById':
        return this.readModel.getById(query.projectId);
      case 'SearchProjects':
        return this.readModel.search(query.term, query.filter);
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
