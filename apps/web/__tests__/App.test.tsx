import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/App';
import { useApp } from '../src/providers/AppProvider';

vi.mock('../src/providers/AppProvider', () => ({
  useApp: vi.fn(),
}));

vi.mock('../src/features/goals/GoalsPage', () => ({
  GoalsPage: () => <div>GoalsPage Stub</div>,
}));
vi.mock('../src/features/projects/ProjectsPage', () => ({
  ProjectsPage: () => <div>ProjectsPage Stub</div>,
}));
vi.mock('../src/components/auth/Onboarding', () => ({
  Onboarding: () => <div>Onboarding Stub</div>,
}));
vi.mock('../src/components/auth/Unlock', () => ({
  Unlock: () => <div>Unlock Stub</div>,
}));
vi.mock('../src/components/auth/RemoteAuthStatus', () => ({
  RemoteAuthStatus: () => <div>RemoteAuthStatus Stub</div>,
}));
vi.mock('../src/components/goals/BackupModal', () => ({
  BackupModal: () => <div>BackupModal Stub</div>,
}));

const mockedUseApp = vi.mocked(useApp);

const makeContext = (session: ReturnType<typeof useApp>['session']) => ({
  session,
  // App shell tests don't exercise services; stub the shape for hook typing.
  services: {} as ReturnType<typeof useApp>['services'],
  userMeta: null,
  completeOnboarding: vi.fn(async () => {}),
  unlock: vi.fn(async () => {}),
  resetLocalState: vi.fn(async () => {}),
  rebuildProjections: vi.fn(async () => {}),
  masterKey: null,
  restoreBackup: vi.fn(async () => {}),
});

describe('App', () => {
  it('shows loading state', () => {
    mockedUseApp.mockReturnValue(makeContext({ status: 'loading' }));
    render(<App />);
    expect(screen.getByText('Loading identity…')).not.toBeNull();
  });

  it('shows onboarding when needed', () => {
    mockedUseApp.mockReturnValue(makeContext({ status: 'needs-onboarding' }));
    render(<App />);
    expect(screen.getByText('Onboarding Stub')).not.toBeNull();
  });

  it('shows unlock when locked', () => {
    mockedUseApp.mockReturnValue(
      makeContext({ status: 'locked', userId: 'user-1' })
    );
    render(<App />);
    expect(screen.getByText('Unlock Stub')).not.toBeNull();
  });

  it('renders tabs and switches pages when ready', async () => {
    mockedUseApp.mockReturnValue(
      makeContext({ status: 'ready', userId: 'user-1' })
    );
    render(<App />);

    expect(await screen.findByText('GoalsPage Stub')).not.toBeNull();
    const projectsTab = screen.getByRole('tab', { name: 'Projects' });
    fireEvent.mouseDown(projectsTab);
    fireEvent.click(projectsTab);
    expect(await screen.findByText('ProjectsPage Stub')).not.toBeNull();
  });
});
