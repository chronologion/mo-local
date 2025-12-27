import type { IGoalReadModel, GoalListFilter } from '@mo/application';
import type { GoalListItemDto } from '@mo/application';
import type { GoalProjectionProcessor } from './projections/runtime/GoalProjectionProcessor';

/**
 * Thin adapter exposing GoalProjectionProcessor as an application read model.
 * Readiness is handled internally so application code stays unaware of infra concerns.
 */
export class GoalReadModel implements IGoalReadModel {
  constructor(private readonly projection: GoalProjectionProcessor) {}

  async list(filter?: GoalListFilter): Promise<GoalListItemDto[]> {
    await this.projection.whenReady();
    await this.projection.flush();
    const all = this.projection.listGoals();
    if (!filter) return all;
    return all.filter((item) => this.matchesFilter(item, filter));
  }

  async getById(goalId: string): Promise<GoalListItemDto | null> {
    await this.projection.whenReady();
    await this.projection.flush();
    return this.projection.getGoalById(goalId);
  }

  async search(
    term: string,
    filter?: GoalListFilter
  ): Promise<GoalListItemDto[]> {
    await this.projection.whenReady();
    await this.projection.flush();
    return this.projection.searchGoals(term, filter);
  }

  private matchesFilter(
    item: GoalListItemDto,
    filter: GoalListFilter
  ): boolean {
    if (filter.slice && item.slice !== filter.slice) return false;
    if (filter.month && item.targetMonth !== filter.month) return false;
    if (filter.priority && item.priority !== filter.priority) return false;
    return true;
  }
}
