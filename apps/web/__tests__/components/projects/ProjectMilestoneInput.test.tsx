import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectMilestoneInput } from '../../../src/components/projects/ProjectMilestoneInput';

const pad = (value: number) => String(value).padStart(2, '0');

const makeRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return {
    startDate: `${year}-${pad(month)}-10`,
    targetDate: `${year}-${pad(month)}-20`,
    month,
    year,
  };
};

const selectDay = (day: number) => {
  fireEvent.click(screen.getByRole('button', { name: /select date/i }));
  const dayButtons = screen.getAllByRole('button', { name: String(day) });
  const dayButton = dayButtons.find((button) => !(button as HTMLButtonElement).disabled) ?? dayButtons[0];
  fireEvent.click(dayButton);
};

describe('ProjectMilestoneInput', () => {
  it('validates required fields', async () => {
    const onAdd = vi.fn(async () => {});
    const { startDate, targetDate } = makeRange();
    render(<ProjectMilestoneInput onAdd={onAdd} startDate={startDate} targetDate={targetDate} />);

    fireEvent.click(screen.getByRole('button', { name: /add milestone/i }));
    expect(screen.getByText('Name and target date are required')).not.toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('rejects dates outside the project range', async () => {
    const onAdd = vi.fn(async () => {});
    const { startDate, targetDate, year, month } = makeRange();
    const { rerender } = render(<ProjectMilestoneInput onAdd={onAdd} startDate={startDate} targetDate={targetDate} />);

    fireEvent.change(screen.getByPlaceholderText('Milestone name'), {
      target: { value: 'Alpha' },
    });
    selectDay(15);
    rerender(<ProjectMilestoneInput onAdd={onAdd} startDate={`${year}-${pad(month)}-16`} targetDate={targetDate} />);
    fireEvent.click(screen.getByRole('button', { name: /add milestone/i }));

    await waitFor(() => {
      expect(screen.getByText('Milestone must be within project date range')).not.toBeNull();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('submits milestone within range', async () => {
    const onAdd = vi.fn(async () => {});
    const { startDate, targetDate, year, month } = makeRange();
    render(<ProjectMilestoneInput onAdd={onAdd} startDate={startDate} targetDate={targetDate} />);

    fireEvent.change(screen.getByPlaceholderText('Milestone name'), {
      target: { value: '  Alpha  ' },
    });
    selectDay(15);
    fireEvent.click(screen.getByRole('button', { name: /add milestone/i }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    expect(onAdd).toHaveBeenCalledWith({
      name: 'Alpha',
      targetDate: `${year}-${pad(month)}-15`,
    });
  });
});
