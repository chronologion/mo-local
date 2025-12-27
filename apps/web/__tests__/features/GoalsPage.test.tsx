import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoalsPage } from '../../src/features/goals/GoalsPage';

vi.mock('../../src/components/goals/GoalDashboard', () => ({
  GoalDashboard: () => <div>GoalDashboard Stub</div>,
}));

describe('GoalsPage', () => {
  it('renders the goal dashboard', () => {
    render(<GoalsPage />);
    expect(screen.getByText('GoalDashboard Stub')).not.toBeNull();
  });
});
