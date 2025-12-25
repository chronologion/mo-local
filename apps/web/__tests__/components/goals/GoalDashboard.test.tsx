import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GoalDashboard } from '../../../src/components/goals/GoalDashboard';
import { useGoalCommands, useGoalSearch, useGoals, useProjects } from '@mo/presentation/react';
import type { GoalListItemDto } from '@mo/application';

vi.mock('@mo/presentation/react', () => ({
  useGoals: vi.fn(),
  useGoalCommands: vi.fn(),
  useGoalSearch: vi.fn(),
  useProjects: vi.fn(),
}));

const mockedUseGoals = vi.mocked(useGoals);
const mockedUseGoalCommands = vi.mocked(useGoalCommands);
const mockedUseGoalSearch = vi.mocked(useGoalSearch);
const mockedUseProjects = vi.mocked(useProjects);

const baseGoal: GoalListItemDto = {
  id: 'goal-1',
  summary: 'Ship tests',
  slice: 'Work',
  priority: 'must',
  targetMonth: '2025-12',
  createdAt: 1,
  achievedAt: null,
  archivedAt: null,
  version: 1,
};

describe('GoalDashboard', () => {
  it('renders empty state and creates a goal', async () => {
    const refresh = vi.fn(async () => {});
    const commands = {
      createGoal: vi.fn(async () => {}),
      archiveGoal: vi.fn(async () => {}),
      updateGoal: vi.fn(async () => {}),
      achieveGoal: vi.fn(async () => {}),
      unachieveGoal: vi.fn(async () => {}),
      loading: false,
      error: null,
    };
    mockedUseGoals.mockReturnValue({
      goals: [],
      loading: false,
      error: null,
      refresh,
    });
    mockedUseGoalCommands.mockReturnValue(commands);
    mockedUseGoalSearch.mockReturnValue({
      results: [],
      loading: false,
    });
    mockedUseProjects.mockReturnValue({
      projects: [],
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });

    render(<GoalDashboard />);

    expect(screen.getByText('No goals yet. Start by creating one.')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /new goal/i }));
    fireEvent.change(screen.getByPlaceholderText('Define a concrete goal'), {
      target: { value: 'Ship tests' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create goal/i }));

    await waitFor(() => {
      expect(commands.createGoal).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('shows search results count when searching', () => {
    const commands = {
      createGoal: vi.fn(async () => {}),
      archiveGoal: vi.fn(async () => {}),
      updateGoal: vi.fn(async () => {}),
      achieveGoal: vi.fn(async () => {}),
      unachieveGoal: vi.fn(async () => {}),
      loading: false,
      error: null,
    };
    mockedUseGoals.mockReturnValue({
      goals: [baseGoal],
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });
    mockedUseGoalCommands.mockReturnValue(commands);
    mockedUseGoalSearch.mockImplementation((term: string) => ({
      results: term ? [baseGoal] : [],
      loading: false,
    }));
    mockedUseProjects.mockReturnValue({
      projects: [],
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });

    render(<GoalDashboard />);
    fireEvent.change(screen.getByPlaceholderText('Search goals...'), {
      target: { value: 'Ship' },
    });

    expect(screen.getByText('1 result(s)')).not.toBeNull();
  });
});
