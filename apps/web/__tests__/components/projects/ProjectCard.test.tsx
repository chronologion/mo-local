import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectCard } from '../../../src/components/projects/ProjectCard';
import type { GoalListItemDto, ProjectListItemDto } from '@mo/application';
import { ToastProvider } from '../../../src/components/ui/toast';
import type { ReactElement } from 'react';

const baseProject: ProjectListItemDto = {
  id: 'project-1',
  name: 'Project Alpha',
  status: 'planned',
  startDate: '2025-01-01',
  targetDate: '2025-02-01',
  description: 'Desc',
  goalId: 'goal-1',
  milestones: [],
  createdAt: 1,
  updatedAt: 1,
  archivedAt: null,
  version: 1,
};

const goals: GoalListItemDto[] = [
  {
    id: 'goal-1',
    summary: 'Goal One',
    slice: 'Health',
    priority: 'must',
    targetMonth: '2025-12',
    createdAt: 1,
    achievedAt: null,
    archivedAt: null,
    version: 1,
  },
];

const renderWithToast = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('ProjectCard', () => {
  it('renders project and triggers edit/archive', async () => {
    const onEdit = vi.fn();
    const onUpdate = vi.fn(async () => {});
    const onArchive = vi.fn(async () => {});

    renderWithToast(
      <ProjectCard
        project={baseProject}
        goals={goals}
        onEdit={onEdit}
        onUpdate={onUpdate}
        onArchive={onArchive}
        onAddMilestone={vi.fn(async () => {})}
        onUpdateMilestone={vi.fn(async () => {})}
        onArchiveMilestone={vi.fn(async () => {})}
        isUpdating={false}
        isArchiving={false}
      />
    );

    expect(screen.getByText('Goal: Goal One')).not.toBeNull();
    expect(screen.getByText('Project Alpha')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('Edit project'));
    expect(onEdit).toHaveBeenCalledWith(baseProject);

    fireEvent.click(screen.getByLabelText('Archive project'));
    await waitFor(() => {
      expect(onArchive).toHaveBeenCalledWith('project-1');
    });
  });

  it('changes status via select', async () => {
    const onUpdate = vi.fn(async () => {});

    renderWithToast(
      <ProjectCard
        project={baseProject}
        goals={goals}
        onEdit={vi.fn()}
        onUpdate={onUpdate}
        onArchive={vi.fn(async () => {})}
        onAddMilestone={vi.fn(async () => {})}
        onUpdateMilestone={vi.fn(async () => {})}
        onArchiveMilestone={vi.fn(async () => {})}
        isUpdating={false}
        isArchiving={false}
      />
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText('In progress'));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('project-1', {
        status: 'in_progress',
      });
    });
  });
});
