import { useMemo } from 'react';
import type { GoalListItemDto } from '@mo/application';
import { useProjects } from '@mo/presentation/react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Archive,
  CheckCircle2,
  Pencil,
  RefreshCw,
  XCircle,
} from 'lucide-react';

type GoalCardProps = {
  goal: GoalListItemDto;
  onEdit: (goal: GoalListItemDto) => void;
  onArchive: () => Promise<void>;
  onToggleAchieved: (goal: GoalListItemDto) => Promise<void>;
  isUpdating: boolean;
  isArchiving: boolean;
  isTogglingAchieved: boolean;
};

export function GoalCard({
  goal,
  onEdit,
  onArchive,
  onToggleAchieved,
  isUpdating,
  isArchiving,
  isTogglingAchieved,
}: GoalCardProps) {
  const projectFilter = useMemo(() => ({ goalId: goal.id }), [goal.id]);
  const { projects, loading: loadingProjects } = useProjects(projectFilter);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{goal.slice}</Badge>
          <Badge>{goal.priority}</Badge>
          {goal.achievedAt !== null && (
            <Badge variant="outline" className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Achieved
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {goal.targetMonth}
        </span>
      </div>
      <div className="space-y-1">
        <div className="text-lg font-semibold text-card-foreground">
          {goal.summary}
        </div>
      </div>
      {loadingProjects ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            Loading linked projects…
          </span>
        </div>
      ) : projects.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {projects.map((project) => (
            <Badge key={project.id} variant="secondary">
              {project.name}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          disabled={isTogglingAchieved}
          onClick={async () => {
            await onToggleAchieved(goal);
          }}
          aria-label={
            goal.achievedAt !== null
              ? 'Mark goal as not achieved'
              : 'Mark goal as achieved'
          }
        >
          {isTogglingAchieved ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : goal.achievedAt !== null ? (
            <XCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={isUpdating}
          onClick={() => onEdit(goal)}
          aria-label="Edit goal"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={async () => {
            await onArchive();
          }}
          disabled={isArchiving}
          aria-label="Archive goal"
        >
          {isArchiving ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
