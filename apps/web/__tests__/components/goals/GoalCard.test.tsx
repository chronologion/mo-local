import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GoalCard } from '../../../src/components/goals/GoalCard';
import type { GoalListItemDto } from '@mo/application';
import { useProjects } from '@mo/presentation/react';

vi.mock('@mo/presentation/react', () => ({
  useProjects: vi.fn(),
}));

const mockedUseProjects = vi.mocked(useProjects);

const baseGoal: GoalListItemDto = {
  id: 'goal-1',
  summary: 'Health goal',
  slice: 'Health',
  priority: 'must',
  targetMonth: '2025-12',
  createdAt: 1,
  achievedAt: null,
  archivedAt: null,
  version: 1,
};

describe('GoalCard', () => {
  it('renders linked projects and triggers actions', async () => {
    mockedUseProjects.mockReturnValue({
      projects: [
        {
          id: 'project-1',
          name: 'Project One',
          status: 'planned',
          startDate: '2025-01-01',
          targetDate: '2025-02-01',
          description: '',
          goalId: baseGoal.id,
          milestones: [],
          createdAt: 1,
          updatedAt: 1,
          archivedAt: null,
          version: 1,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });

    const onEdit = vi.fn();
    const onArchive = vi.fn(async () => {});
    const onToggleAchieved = vi.fn(async () => {});

    render(
      <GoalCard
        goal={baseGoal}
        onEdit={onEdit}
        onArchive={onArchive}
        onToggleAchieved={onToggleAchieved}
        isUpdating={false}
        isArchiving={false}
        isTogglingAchieved={false}
      />
    );

    expect(screen.getByText('Health')).not.toBeNull();
    expect(screen.getByText('must')).not.toBeNull();
    expect(screen.getByText('Project One')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('Edit goal'));
    expect(onEdit).toHaveBeenCalledWith(baseGoal);

    fireEvent.click(screen.getByLabelText('Archive goal'));
    await waitFor(() => {
      expect(onArchive).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByLabelText('Mark goal as achieved'));
    await waitFor(() => {
      expect(onToggleAchieved).toHaveBeenCalledWith(baseGoal);
    });
  });

  it('shows achieved badge when achievedAt is set', () => {
    mockedUseProjects.mockReturnValue({
      projects: [],
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });

    render(
      <GoalCard
        goal={{ ...baseGoal, achievedAt: 10 }}
        onEdit={vi.fn()}
        onArchive={vi.fn(async () => {})}
        onToggleAchieved={vi.fn(async () => {})}
        isUpdating={false}
        isArchiving={false}
        isTogglingAchieved={false}
      />
    );

    expect(screen.getByText('Achieved')).not.toBeNull();
    expect(screen.getByLabelText('Mark goal as not achieved')).not.toBeNull();
  });
});
