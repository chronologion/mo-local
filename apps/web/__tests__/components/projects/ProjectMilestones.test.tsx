import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MilestonesList } from '../../../src/components/projects/ProjectMilestones';

const pad = (value: number) => String(value).padStart(2, '0');

const makeRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return {
    startDate: `${year}-${pad(month)}-10`,
    targetDate: `${year}-${pad(month)}-20`,
    year,
    month,
  };
};

const formatLabel = (iso: string) => {
  const [year, month, day] = iso.split('-').map((part) => Number(part));
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(year, (month ?? 1) - 1, day ?? 1));
};

const selectDay = (day: number, currentIso: string) => {
  const triggerLabel = formatLabel(currentIso);
  fireEvent.click(screen.getByRole('button', { name: triggerLabel }));
  const dayButtons = screen.getAllByRole('button', { name: String(day) });
  const dayButton = dayButtons.find((button) => !(button as HTMLButtonElement).disabled) ?? dayButtons[0];
  fireEvent.click(dayButton);
};

describe('MilestonesList', () => {
  it('shows empty state when no milestones', () => {
    const { startDate, targetDate } = makeRange();
    render(
      <MilestonesList
        milestones={[]}
        onUpdate={vi.fn(async () => {})}
        onArchive={vi.fn(async () => {})}
        startDate={startDate}
        targetDate={targetDate}
      />
    );
    expect(screen.getByText('No milestones yet.')).not.toBeNull();
  });

  it('edits and updates a milestone', async () => {
    const onUpdate = vi.fn(async () => {});
    const { startDate, targetDate, year, month } = makeRange();
    render(
      <MilestonesList
        milestones={[{ id: 'm1', name: 'Alpha', targetDate: startDate }]}
        onUpdate={onUpdate}
        onArchive={vi.fn(async () => {})}
        startDate={startDate}
        targetDate={targetDate}
      />
    );

    fireEvent.click(screen.getByLabelText('Edit milestone'));
    fireEvent.change(screen.getByDisplayValue('Alpha'), {
      target: { value: 'Beta' },
    });
    selectDay(15, startDate);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    expect(onUpdate).toHaveBeenCalledWith('m1', {
      name: 'Beta',
      targetDate: `${year}-${pad(month)}-15`,
    });
  });

  it('rejects milestones outside project range', async () => {
    const onUpdate = vi.fn(async () => {});
    const { startDate, targetDate, year, month } = makeRange();
    const { rerender } = render(
      <MilestonesList
        milestones={[{ id: 'm1', name: 'Alpha', targetDate: startDate }]}
        onUpdate={onUpdate}
        onArchive={vi.fn(async () => {})}
        startDate={startDate}
        targetDate={targetDate}
      />
    );

    fireEvent.click(screen.getByLabelText('Edit milestone'));
    selectDay(15, startDate);
    rerender(
      <MilestonesList
        milestones={[{ id: 'm1', name: 'Alpha', targetDate: startDate }]}
        onUpdate={onUpdate}
        onArchive={vi.fn(async () => {})}
        startDate={`${year}-${pad(month)}-16`}
        targetDate={targetDate}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('Milestone must be on/after project start')).not.toBeNull();
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
