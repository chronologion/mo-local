import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectsPage } from '../../src/features/projects/ProjectsPage';
import { ToastProvider } from '../../src/components/ui/toast';
import {
  useGoals,
  useProjects,
  useProjectCommands,
} from '@mo/presentation/react';
import type { ProjectListItemDto, GoalListItemDto } from '@mo/application';

vi.mock('@mo/presentation/react', () => ({
  useGoals: vi.fn(),
  useProjects: vi.fn(),
  useProjectCommands: vi.fn(),
}));

vi.mock('../../src/components/projects/ProjectForm', () => ({
  ProjectForm: ({
    onSubmit,
  }: {
    onSubmit: (values: unknown) => Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSubmit({
          name: 'New project',
          startDate: '2025-01-01',
          targetDate: '2025-02-01',
          description: 'Desc',
          goalId: null,
        })
      }
    >
      Submit Project Form
    </button>
  ),
}));

vi.mock('../../src/components/projects/ProjectCard', () => ({
  ProjectCard: ({ project }: { project: ProjectListItemDto }) => (
    <div>ProjectCard: {project.name}</div>
  ),
}));

const mockedUseGoals = vi.mocked(useGoals);
const mockedUseProjects = vi.mocked(useProjects);
const mockedUseProjectCommands = vi.mocked(useProjectCommands);

const renderPage = () =>
  render(
    <ToastProvider>
      <ProjectsPage />
    </ToastProvider>
  );

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

const projects: ProjectListItemDto[] = [
  {
    id: 'p1',
    name: 'Alpha',
    status: 'planned',
    startDate: '2025-01-01',
    targetDate: '2025-02-01',
    description: 'Alpha desc',
    goalId: null,
    milestones: [],
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    version: 1,
  },
  {
    id: 'p2',
    name: 'Beta',
    status: 'planned',
    startDate: '2025-01-01',
    targetDate: '2025-02-01',
    description: 'Beta desc',
    goalId: null,
    milestones: [],
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    version: 1,
  },
];

describe('ProjectsPage', () => {
  it('renders empty state when no projects', () => {
    mockedUseGoals.mockReturnValue({
      goals,
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });
    mockedUseProjects.mockReturnValue({
      projects: [],
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });
    mockedUseProjectCommands.mockReturnValue({
      createProject: vi.fn(async () => ({ projectId: 'p1' })),
      updateProject: vi.fn(async () => {}),
      archiveProject: vi.fn(async () => ({ projectId: 'p1' })),
      addMilestone: vi.fn(async () => ({ projectId: 'p1' })),
      updateMilestone: vi.fn(async () => {}),
      archiveMilestone: vi.fn(async () => ({ projectId: 'p1' })),
      loading: false,
      error: null,
    });

    renderPage();
    expect(
      screen.getByText(
        'No projects yet. Create one to link goals and milestones.'
      )
    ).not.toBeNull();
  });

  it('filters projects by search term', () => {
    mockedUseGoals.mockReturnValue({
      goals,
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });
    mockedUseProjects.mockReturnValue({
      projects,
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });
    mockedUseProjectCommands.mockReturnValue({
      createProject: vi.fn(async () => ({ projectId: 'p1' })),
      updateProject: vi.fn(async () => {}),
      archiveProject: vi.fn(async () => ({ projectId: 'p1' })),
      addMilestone: vi.fn(async () => ({ projectId: 'p1' })),
      updateMilestone: vi.fn(async () => {}),
      archiveMilestone: vi.fn(async () => ({ projectId: 'p1' })),
      loading: false,
      error: null,
    });

    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Search projects...'), {
      target: { value: 'Alpha' },
    });

    expect(screen.getByText('1 result(s)')).not.toBeNull();
    expect(screen.getByText('ProjectCard: Alpha')).not.toBeNull();
    expect(screen.queryByText('ProjectCard: Beta')).toBeNull();
  });

  it('shows create errors from form submission', async () => {
    const refresh = vi.fn(async () => {});
    const createProject = vi.fn(async () => {
      throw new Error('boom');
    });
    mockedUseGoals.mockReturnValue({
      goals,
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
    });
    mockedUseProjects.mockReturnValue({
      projects: [],
      loading: false,
      error: null,
      refresh,
    });
    mockedUseProjectCommands.mockReturnValue({
      createProject,
      updateProject: vi.fn(async () => {}),
      archiveProject: vi.fn(async () => ({ projectId: 'p1' })),
      addMilestone: vi.fn(async () => ({ projectId: 'p1' })),
      updateMilestone: vi.fn(async () => {}),
      archiveMilestone: vi.fn(async () => ({ projectId: 'p1' })),
      loading: false,
      error: null,
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    fireEvent.click(screen.getByText('Submit Project Form'));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('boom')).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
