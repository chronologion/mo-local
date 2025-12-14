import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import {
  useGoals,
  useGoalCommands,
  useGoalSearch,
} from '@mo/presentation/react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { GoalForm } from './GoalForm';
import { GoalCard } from './GoalCard';
import { GoalFormValues } from './goalFormTypes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import type { GoalListItemDto } from '@mo/application';

export function GoalDashboard() {
  const { goals, loading, error, refresh } = useGoals();
  const {
    createGoal,
    archiveGoal,
    updateGoal,
    loading: mutating,
    error: mutationError,
  } = useGoalCommands();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalListItemDto | null>(null);
  const [pending, setPending] = useState<{
    id: string;
    action: 'archive' | 'update';
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

  const handleArchiveGoal = async (goalId: string) => {
    setPending({ id: goalId, action: 'archive' });
    try {
      await archiveGoal(goalId);
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
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Goals</h1>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground shadow-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Search goals..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={() => setCreateOpen(true)}>New goal</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="gap-2"
              aria-label="Refresh goals"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              <span className="sr-only">Refresh goals</span>
            </Button>
          </div>
        </div>
      </div>

      {search && (
        <div className="text-sm text-muted-foreground">
          {searching ? 'Searching…' : `${searchResults.length} result(s)`}
        </div>
      )}
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
            onEdit={(g) => setEditingGoal(g)}
            onArchive={() => handleArchiveGoal(goal.id)}
            isUpdating={
              mutating &&
              !!pending &&
              pending.id === goal.id &&
              pending.action === 'update'
            }
            isArchiving={
              mutating &&
              !!pending &&
              pending.id === goal.id &&
              pending.action === 'archive'
            }
          />
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create goal</DialogTitle>
          </DialogHeader>
          <GoalForm
            onSubmit={async (params) => {
              await handleCreateGoal(params);
              setCreateOpen(false);
            }}
          />
          {(mutationError || error) && (
            <p className="text-sm text-destructive">{mutationError || error}</p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editingGoal}
        onOpenChange={(open) => {
          if (!open) setEditingGoal(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit goal</DialogTitle>
          </DialogHeader>
          {editingGoal ? (
            <GoalForm
              initialValues={{
                summary: editingGoal.summary,
                slice: editingGoal.slice as GoalFormValues['slice'],
                priority: editingGoal.priority as GoalFormValues['priority'],
                targetMonth: editingGoal.targetMonth,
              }}
              submitLabel="Save changes"
              onSubmit={async (changes) => {
                await handleUpdateGoal(editingGoal.id, changes);
                setEditingGoal(null);
              }}
            />
          ) : null}
          {(mutationError || error) && (
            <p className="text-sm text-destructive">{mutationError || error}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
