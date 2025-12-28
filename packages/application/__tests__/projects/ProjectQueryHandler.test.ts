import { describe, expect, it } from 'vitest';
import { ProjectQueryHandler } from '../../src/projects/ProjectQueryHandler';
import { ListProjectsQuery } from '../../src/projects/queries/ListProjectsQuery';
import { GetProjectByIdQuery } from '../../src/projects/queries/GetProjectByIdQuery';
import { SearchProjectsQuery } from '../../src/projects/queries/SearchProjectsQuery';
import type { ProjectReadModelPort } from '../../src/projects/ports/ProjectReadModelPort';
import type { ProjectListItemDto } from '../../src/projects/dtos';

const sampleProject: ProjectListItemDto = {
  id: 'project-1',
  name: 'Project One',
  status: 'planned',
  startDate: '2025-01-01',
  targetDate: '2025-02-01',
  description: 'Sample project',
  goalId: null,
  milestones: [],
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  version: 1,
};

class FakeProjectReadModel implements ProjectReadModelPort {
  listCalls: Array<{ filter?: { status?: string } }> = [];
  getByIdCalls: string[] = [];
  searchCalls: Array<{ term: string; filter?: { status?: string } }> = [];

  constructor(private readonly response: ProjectListItemDto[]) {}

  async list(filter?: { status?: string }): Promise<ProjectListItemDto[]> {
    this.listCalls.push({ filter });
    return this.response;
  }

  async getById(id: string): Promise<ProjectListItemDto | null> {
    this.getByIdCalls.push(id);
    return this.response.find((item) => item.id === id) ?? null;
  }

  async search(
    term: string,
    filter?: { status?: string }
  ): Promise<ProjectListItemDto[]> {
    this.searchCalls.push({ term, filter });
    return this.response.filter((item) =>
      item.name.toLowerCase().includes(term.toLowerCase())
    );
  }
}

describe('ProjectQueryHandler', () => {
  it('delegates list queries to the read model', async () => {
    const readModel = new FakeProjectReadModel([sampleProject]);
    const handler = new ProjectQueryHandler(readModel);
    const filter = { status: 'planned' };

    const result = await handler.execute(new ListProjectsQuery(filter));

    expect(result).toEqual([sampleProject]);
    expect(readModel.listCalls).toEqual([{ filter }]);
  });

  it('delegates get by id queries', async () => {
    const readModel = new FakeProjectReadModel([sampleProject]);
    const handler = new ProjectQueryHandler(readModel);

    const result = await handler.execute(new GetProjectByIdQuery('project-1'));

    expect(result).toEqual(sampleProject);
    expect(readModel.getByIdCalls).toEqual(['project-1']);
  });

  it('delegates search queries', async () => {
    const readModel = new FakeProjectReadModel([sampleProject]);
    const handler = new ProjectQueryHandler(readModel);
    const filter = { status: 'planned' };

    const result = await handler.execute(
      new SearchProjectsQuery('project', filter)
    );

    expect(result).toEqual([sampleProject]);
    expect(readModel.searchCalls).toEqual([{ term: 'project', filter }]);
  });

  it('rejects unsupported project queries', async () => {
    const readModel = new FakeProjectReadModel([sampleProject]);
    const handler = new ProjectQueryHandler(readModel);

    // @ts-expect-error - exercising runtime guard for unsupported query
    await expect(
      handler.execute({ type: 'UnknownProjectQuery' })
    ).rejects.toThrow(/Unsupported project query type/);
  });
});
