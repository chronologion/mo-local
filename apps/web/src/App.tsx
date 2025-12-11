import { lazy, Suspense, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useApp } from './providers/AppProvider';
import { Card, CardContent } from './components/ui/card';
import { Onboarding } from './components/auth/Onboarding';
import { Unlock } from './components/auth/Unlock';

const GoalsPage = lazy(() =>
  import('./features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage }))
);
const ProjectsPage = lazy(() =>
  import('./features/projects/ProjectsPage').then((m) => ({
    default: m.ProjectsPage,
  }))
);

export default function App() {
  const { session } = useApp();
  const [tab, setTab] = useState<'goals' | 'projects'>('goals');

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5 bg-panel/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg from-accent to-accent2 font-bold">
              MO
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest">MO Local</div>
              <div className="text-sm">Offline POC · LiveStore/OPFS</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-accent2" />
            Zero-knowledge, local-first
          </div>
        </div>
      </header>
      {session.status === 'loading' && (
        <div className="mx-auto max-w-5xl px-4 py-10">
          <Card>
            <CardContent className="flex items-center gap-3">
              <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
              Loading identity…
            </CardContent>
          </Card>
        </div>
      )}
      {session.status === 'needs-onboarding' && <Onboarding />}
      {session.status === 'locked' && <Unlock />}
      {session.status === 'ready' && (
        <Suspense
          fallback={
            <div className="mx-auto max-w-5xl px-4 py-10">
              <Card>
                <CardContent className="flex items-center gap-3">
                  <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
                  Loading…
                </CardContent>
              </Card>
            </div>
          }
        >
          <div className="mx-auto max-w-6xl px-4 pt-4">
            <div className="mb-4 flex gap-2">
              <button
                className={`rounded-full px-4 py-2 text-sm ${
                  tab === 'goals'
                    ? 'bg-accent text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
                onClick={() => setTab('goals')}
              >
                Goals
              </button>
              <button
                className={`rounded-full px-4 py-2 text-sm ${
                  tab === 'projects'
                    ? 'bg-accent text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
                onClick={() => setTab('projects')}
              >
                Projects
              </button>
            </div>
          </div>
          {tab === 'goals' ? <GoalsPage /> : <ProjectsPage />}
        </Suspense>
      )}
    </div>
  );
}
