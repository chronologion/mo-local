import { RefreshCw, Sparkles } from 'lucide-react';
import { useApp } from './providers/AppProvider';
import {
  Card,
  CardContent,
} from './components/ui/card';
import { Onboarding } from './components/auth/Onboarding';
import { Unlock } from './components/auth/Unlock';
import { GoalDashboard } from './components/goals/GoalDashboard';

export default function App() {
  const { session } = useApp();

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5 bg-panel/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-slate-950 font-bold">
              MO
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500">
                MO Local
              </div>
              <div className="text-sm text-slate-200">
                Offline POC · LiveStore/OPFS
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Sparkles className="h-4 w-4 text-accent2" />
            Zero-knowledge, local-first
          </div>
        </div>
      </header>
      {session.status === 'loading' && (
        <div className="mx-auto max-w-5xl px-4 py-10">
          <Card>
            <CardContent className="flex items-center gap-3 text-slate-300">
              <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
              Loading identity…
            </CardContent>
          </Card>
        </div>
      )}
      {session.status === 'needs-onboarding' && <Onboarding />}
      {session.status === 'locked' && <Unlock />}
      {session.status === 'ready' && <GoalDashboard />}
    </div>
  );
}
