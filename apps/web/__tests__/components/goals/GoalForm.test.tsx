import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GoalForm } from '../../../src/components/goals/GoalForm';
import { getDefaultTargetMonth } from '../../../src/components/goals/goalFormTypes';

describe('GoalForm', () => {
  it('submits with default values and resets summary on create', async () => {
    const handleSubmit = vi.fn(async () => {});
    render(<GoalForm onSubmit={handleSubmit} />);

    const summaryInput = screen.getByPlaceholderText('Define a concrete goal');
    fireEvent.change(summaryInput, { target: { value: 'Ship tests' } });

    fireEvent.click(screen.getByRole('button', { name: /create goal/i }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    expect(handleSubmit).toHaveBeenCalledWith({
      summary: 'Ship tests',
      slice: 'Health',
      priority: 'must',
      targetMonth: getDefaultTargetMonth(),
    });

    await waitFor(() => {
      expect((screen.getByPlaceholderText('Define a concrete goal') as HTMLInputElement).value).toBe('');
    });
  });

  it('uses initial values and does not reset on submit', async () => {
    const handleSubmit = vi.fn(async () => {});
    render(
      <GoalForm
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        initialValues={{
          summary: 'Existing goal',
          slice: 'Work',
          priority: 'should',
          targetMonth: '2025-12',
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    expect(handleSubmit).toHaveBeenCalledWith({
      summary: 'Existing goal',
      slice: 'Work',
      priority: 'should',
      targetMonth: '2025-12',
    });
    expect((screen.getByPlaceholderText('Define a concrete goal') as HTMLInputElement).value).toBe('Existing goal');
  });
});
