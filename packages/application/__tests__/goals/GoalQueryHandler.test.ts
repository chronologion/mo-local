import { describe, expect, it } from 'vitest';
import { GoalQueryHandler } from '../../src/goals/GoalQueryHandler';
import {
  GetGoalByIdQuery,
  ListGoalsQuery,
  SearchGoalsQuery,
} from '../../src/goals/queries';
import type { IGoalReadModel } from '../../src/goals/ports/IGoalReadModel';
import type { GoalListItemDto } from '../../src/goals/dtos';

const sampleGoal: GoalListItemDto = {
  id: 'goal-1',
  summary: 'Test goal',
  slice: 'Health',
  priority: 'must',
  targetMonth: '2025-12',
  createdAt: 1,
  achievedAt: null,
  archivedAt: null,
  version: 1,
};

class FakeGoalReadModel implements IGoalReadModel {
  listCalls: Array<{ filter?: { slice?: string } }> = [];
  getByIdCalls: string[] = [];
  searchCalls: Array<{ term: string; filter?: { slice?: string } }> = [];

  constructor(private readonly response: GoalListItemDto[]) {}

  async list(filter?: { slice?: string }): Promise<GoalListItemDto[]> {
    this.listCalls.push({ filter });
    return this.response;
  }

  async getById(id: string): Promise<GoalListItemDto | null> {
    this.getByIdCalls.push(id);
    return this.response.find((item) => item.id === id) ?? null;
  }

  async search(
    term: string,
    filter?: { slice?: string }
  ): Promise<GoalListItemDto[]> {
    this.searchCalls.push({ term, filter });
    return this.response.filter((item) =>
      item.summary.toLowerCase().includes(term.toLowerCase())
    );
  }
}

describe('GoalQueryHandler', () => {
  it('delegates list queries to the read model', async () => {
    const readModel = new FakeGoalReadModel([sampleGoal]);
    const handler = new GoalQueryHandler(readModel);
    const filter = { slice: 'Health' };

    const result = await handler.execute(new ListGoalsQuery(filter));

    expect(result).toEqual([sampleGoal]);
    expect(readModel.listCalls).toEqual([{ filter }]);
  });

  it('delegates get by id queries', async () => {
    const readModel = new FakeGoalReadModel([sampleGoal]);
    const handler = new GoalQueryHandler(readModel);

    const result = await handler.execute(new GetGoalByIdQuery('goal-1'));

    expect(result).toEqual(sampleGoal);
    expect(readModel.getByIdCalls).toEqual(['goal-1']);
  });

  it('delegates search queries', async () => {
    const readModel = new FakeGoalReadModel([sampleGoal]);
    const handler = new GoalQueryHandler(readModel);
    const filter = { slice: 'Health' };

    const result = await handler.execute(new SearchGoalsQuery('test', filter));

    expect(result).toEqual([sampleGoal]);
    expect(readModel.searchCalls).toEqual([{ term: 'test', filter }]);
  });

  it('rejects unsupported goal queries', async () => {
    const readModel = new FakeGoalReadModel([sampleGoal]);
    const handler = new GoalQueryHandler(readModel);

    // @ts-expect-error - exercising runtime guard for unsupported query
    await expect(handler.execute({ type: 'UnknownGoalQuery' })).rejects.toThrow(
      /Unsupported goal query type/
    );
  });
});
