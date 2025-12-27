import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectForm } from '../../../src/components/projects/ProjectForm';
import type { GoalListItemDto } from '@mo/application';

const todayIso = () => new Date().toISOString().slice(0, 10);

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

describe('ProjectForm', () => {
  it('submits with defaults and resets values', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ProjectForm onSubmit={onSubmit} goals={goals} />);

    fireEvent.change(screen.getByPlaceholderText('Project name'), {
      target: { value: 'Project Alpha' },
    });
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[textboxes.length - 1], {
      target: { value: 'Description' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Project Alpha',
      startDate: todayIso(),
      targetDate: todayIso(),
      description: 'Description',
      goalId: null,
    });
  });

  it('allows selecting a linked goal', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ProjectForm onSubmit={onSubmit} goals={goals} />);

    fireEvent.change(screen.getByPlaceholderText('Project name'), {
      target: { value: 'Project Linked' },
    });

    const trigger = screen.getByRole('combobox');
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name: 'Goal One' }));

    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        goalId: 'goal-1',
      })
    );
  });

  it('uses initial values and submit label', async () => {
    const onSubmit = vi.fn(async () => {});
    render(
      <ProjectForm
        onSubmit={onSubmit}
        goals={goals}
        submitLabel="Save changes"
        initialValues={{
          name: 'Existing',
          description: 'Existing desc',
          startDate: '2025-01-01',
          targetDate: '2025-02-01',
          goalId: 'goal-1',
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Existing',
      description: 'Existing desc',
      startDate: '2025-01-01',
      targetDate: '2025-02-01',
      goalId: 'goal-1',
    });
  });
});
