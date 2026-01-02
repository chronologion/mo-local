import { lazy, Suspense, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useApp } from './providers/AppProvider';
import { Button } from './components/ui/button';
import { Onboarding } from './components/auth/Onboarding';
import { Unlock } from './components/auth/Unlock';
import { RemoteAuthStatus } from './components/auth/RemoteAuthStatus';
import { BackupModal } from './components/goals/BackupModal';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { ToastProvider } from './components/ui/toast';

const GoalsPage = lazy(() => import('./features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const ProjectsPage = lazy(() =>
  import('./features/projects/ProjectsPage').then((m) => ({
    default: m.ProjectsPage,
  }))
);

export default function App() {
  const { session } = useApp();
  const [tab, setTab] = useState<'goals' | 'projects'>('goals');
  const [backupOpen, setBackupOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border/70 bg-background shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-foreground">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg from-accent to-accent2 bg-linear-to-br font-bold text-foreground">
                <Sparkles className="h-4 w-4 text-black" />
              </div>
              <div>
                <div className="text-sm font-bold">Local-first / ES / ZK sync</div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {session.status === 'ready' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setBackupOpen(true)}
                  className="hidden md:inline-flex"
                >
                  Backup
                </Button>
              ) : null}
              {session.status === 'ready' ? <RemoteAuthStatus /> : null}
            </div>
          </div>
        </header>
        {session.status === 'loading' && (
          <div className="mx-auto max-w-md px-4 py-10">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card/80 p-4 shadow-sm">
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">Loading identity…</span>
            </div>
          </div>
        )}
        {session.status === 'needs-onboarding' && <Onboarding />}
        {session.status === 'locked' && <Unlock />}
        {session.status === 'ready' && (
          <Suspense
            fallback={
              <div className="mx-auto max-w-md px-4 py-10">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card/80 p-4 shadow-sm">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-foreground">Loading…</span>
                </div>
              </div>
            }
          >
            <div className="mx-auto max-w-6xl px-4 pt-4">
              <Tabs value={tab} onValueChange={(v) => setTab(v as 'goals' | 'projects')}>
                <TabsList>
                  <TabsTrigger value="goals">Goals</TabsTrigger>
                  <TabsTrigger value="projects">Projects</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {tab === 'goals' ? <GoalsPage /> : <ProjectsPage />}
            <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
          </Suspense>
        )}
      </div>
    </ToastProvider>
  );
}
