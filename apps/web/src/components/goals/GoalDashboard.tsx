import { useMemo, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { useApp } from '../../providers/AppProvider';
import { useGoals } from '../../hooks/useGoals';
import { useGoalCommands } from '../../hooks/useGoalCommands';
import { useGoalSearch } from '../../hooks/useGoalSearch';
import { Button } from '../ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import { GoalForm } from './GoalForm';
import { GoalCard } from './GoalCard';
import { BackupModal } from './BackupModal';
import { GoalFormValues } from './goalFormTypes';

export function GoalDashboard() {
  const { session } = useApp();
  const { goals, loading, error, refresh } = useGoals();
  const {
    createGoal,
    deleteGoal,
    updateGoal,
    loading: mutating,
    error: mutationError,
  } = useGoalCommands();
  const [backupOpen, setBackupOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<{
    id: string;
    action: 'delete' | 'update';
  } | null>(null);
  const { results: searchResults, loading: searching } = useGoalSearch(search);

  const sortedGoals = useMemo(
    () => [...goals].sort((a, b) => a.targetMonth.localeCompare(b.targetMonth)),
    [goals]
  );

  const handleCreateGoal = async (params: GoalFormValues) => {
    await createGoal(params);
    await refresh();
  };

  const handleDeleteGoal = async (goalId: string) => {
    setPending({ id: goalId, action: 'delete' });
    try {
      await deleteGoal(goalId);
      await refresh();
    } finally {
      setPending(null);
    }
  };

  const handleUpdateGoal = async (
    goalId: string,
    changes: Partial<GoalFormValues>
  ) => {
    if (!Object.keys(changes).length) {
      return;
    }
    setPending({ id: goalId, action: 'update' });
    try {
      await updateGoal({ goalId, ...changes });
      await refresh();
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">local-only</Badge>
              <span className="flex items-center gap-1">
                <KeyRound className="h-4 w-4 text-primary" /> User:{' '}
                {session.status === 'ready' ? session.userId : '—'}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Goals (offline)
            </h1>
            <p className="text-sm text-muted-foreground">
              No sync or sharing yet. Everything persists in OPFS/LiveStore.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setBackupOpen(true)}>
              Backup keys
            </Button>
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw
                className={cn('mr-2 h-4 w-4', loading && 'animate-spin')}
              />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New goal</CardTitle>
          <CardDescription>
            All data is encrypted locally before hitting storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoalForm onSubmit={handleCreateGoal} />
          {(mutationError || error) && (
            <p className="text-sm text-destructive">{mutationError || error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your goals</CardTitle>
            <CardDescription>
              Reacts to LiveStore commits; keeps projections current without
              reload.
            </CardDescription>
          </div>
          {loading && (
            <span className="text-sm text-muted-foreground">Loading…</span>
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <Input
              placeholder="Search goals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:w-80"
            />
            {search && (
              <span className="text-sm text-muted-foreground">
                {searching ? 'Searching…' : `${searchResults.length} result(s)`}
              </span>
            )}
          </div>
          {sortedGoals.length === 0 && !loading ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">
              No goals yet. Start by creating one.
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {(search ? searchResults : sortedGoals).map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onSave={(changes) => handleUpdateGoal(goal.id, changes)}
                onDelete={() => handleDeleteGoal(goal.id)}
                isUpdating={
                  mutating &&
                  !!pending &&
                  pending.id === goal.id &&
                  pending.action === 'update'
                }
                isDeleting={
                  mutating &&
                  !!pending &&
                  pending.id === goal.id &&
                  pending.action === 'delete'
                }
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
    </div>
  );
}
