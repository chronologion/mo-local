import { useMemo, useState } from 'react';
import { ProjectListItem } from '@mo/infrastructure/browser';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { RefreshCw, Archive } from 'lucide-react';
import { GoalListItem } from '@mo/infrastructure/browser';

type ProjectCardProps = {
  project: ProjectListItem;
  goals: GoalListItem[];
  onUpdate: (
    projectId: string,
    changes: {
      status?: ProjectListItem['status'];
      name?: string;
      description?: string;
      startDate?: string;
      targetDate?: string;
      goalId?: string | null;
    }
  ) => Promise<void>;
  onArchive: (projectId: string) => Promise<void>;
  isUpdating: boolean;
  isArchiving: boolean;
};

const allowedTransitions: Record<ProjectListItem['status'], ProjectListItem['status'][]> =
  {
    planned: ['in_progress', 'canceled'],
    in_progress: ['completed', 'canceled'],
    completed: [],
    canceled: [],
  };

export function ProjectCard({
  project,
  goals,
  onUpdate,
  onArchive,
  isUpdating,
  isArchiving,
}: ProjectCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: project.name,
    description: project.description,
    startDate: project.startDate,
    targetDate: project.targetDate,
    goalId: project.goalId ?? 'none',
  });

  const nextStatuses = useMemo(
    () => allowedTransitions[project.status],
    [project.status]
  );

  const save = async () => {
    const changes: Record<string, unknown> = {};
    if (draft.name !== project.name) changes.name = draft.name;
    if (draft.description !== project.description)
      changes.description = draft.description;
    if (draft.startDate !== project.startDate) changes.startDate = draft.startDate;
    if (draft.targetDate !== project.targetDate) changes.targetDate = draft.targetDate;
    const draftGoalId = draft.goalId === 'none' ? null : draft.goalId;
    if (draftGoalId !== project.goalId) changes.goalId = draftGoalId;
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }
    await onUpdate(project.id, changes);
    setEditing(false);
  };

  const linkLabel = project.goalId
    ? goals.find((g) => g.id === project.goalId)?.summary ?? project.goalId
    : 'Unlinked';

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{project.status.replace('_', ' ')}</Badge>
          <Badge variant="secondary">
            {project.startDate} → {project.targetDate}
          </Badge>
          <Badge variant="outline">Goal: {linkLabel}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          Updated {new Date(project.updatedAt).toLocaleDateString()}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-lg font-semibold">{project.name}</div>
        <div className="text-sm text-muted-foreground">{project.description}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((status) => (
          <Button
            key={status}
            size="sm"
            variant="secondary"
            onClick={async () => {
              await onUpdate(project.id, { status });
            }}
            disabled={isUpdating}
          >
            Move to {status.replace('_', ' ')}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await onArchive(project.id);
          }}
          disabled={isArchiving}
        >
          {isArchiving ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
          <span className="sr-only">Archive</span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditing((prev) => !prev)}
          disabled={isUpdating}
        >
          {editing ? 'Cancel' : 'Edit'}
        </Button>
      </div>
      {editing && (
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              value={draft.name}
              onChange={(ev) =>
                setDraft((prev) => ({ ...prev, name: ev.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={draft.description}
              onChange={(ev) =>
                setDraft((prev) => ({ ...prev, description: ev.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start</Label>
              <Input
                type="date"
                value={draft.startDate}
                onChange={(ev) =>
                  setDraft((prev) => ({ ...prev, startDate: ev.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Target</Label>
              <Input
                type="date"
                value={draft.targetDate}
                onChange={(ev) =>
                  setDraft((prev) => ({ ...prev, targetDate: ev.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Linked Goal</Label>
            <Select
              value={draft.goalId}
              onValueChange={(value) =>
                setDraft((prev) => ({ ...prev, goalId: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select goal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No goal</SelectItem>
                {goals.map((goal) => (
                  <SelectItem key={goal.id} value={goal.id}>
                    {goal.summary}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={async () => {
              await save();
            }}
            disabled={isUpdating}
          >
            {isUpdating ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}
