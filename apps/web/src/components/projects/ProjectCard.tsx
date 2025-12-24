import { useMemo, useState } from 'react';
import type { GoalListItemDto, ProjectListItemDto } from '@mo/application';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RefreshCw, Archive, Pencil, Plus } from 'lucide-react';
import { MilestonesList } from './ProjectMilestones';
import { ProjectMilestoneInput } from './ProjectMilestoneInput';
import { useToast } from '../ui/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

type ProjectCardProps = {
  project: ProjectListItemDto;
  goals: GoalListItemDto[];
  onEdit: (project: ProjectListItemDto) => void;
  onUpdate: (
    projectId: string,
    changes: {
      status?: ProjectListItemDto['status'];
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
  onAddMilestone: (
    projectId: string,
    milestone: { name: string; targetDate: string }
  ) => Promise<void>;
  onUpdateMilestone: (
    projectId: string,
    milestoneId: string,
    changes: { name?: string; targetDate?: string }
  ) => Promise<void>;
  onArchiveMilestone: (projectId: string, milestoneId: string) => Promise<void>;
};

const statusOptions: ProjectListItemDto['status'][] = [
  'planned',
  'in_progress',
  'completed',
  'canceled',
];
const statusLabels: Record<ProjectListItemDto['status'], string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  canceled: 'Canceled',
};

export function ProjectCard({
  project,
  goals,
  onEdit,
  onUpdate,
  onArchive,
  onAddMilestone,
  onUpdateMilestone,
  onArchiveMilestone,
  isUpdating,
  isArchiving,
}: ProjectCardProps) {
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const toast = useToast();
  const nextStatuses = useMemo(
    () => statusOptions.filter((status) => status !== project.status),
    [project.status]
  );

  const linkLabel = project.goalId
    ? (goals.find((g) => g.id === project.goalId)?.summary ?? project.goalId)
    : 'Unlinked';

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Goal: {linkLabel}</Badge>
            </div>
            <div className="text-lg font-semibold">{project.name}</div>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm text-muted-foreground">
            <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
              {project.startDate} → {project.targetDate}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={project.status}
            onValueChange={(value) => {
              if (value === project.status) return;
              void (async () => {
                try {
                  await onUpdate(project.id, {
                    status: value as ProjectListItemDto['status'],
                  });
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : 'Failed to change status';
                  toast({
                    title: 'Project update failed',
                    description: message,
                  });
                }
              })();
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={project.status} disabled>
                {statusLabels[project.status]}
              </SelectItem>
              {nextStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {statusLabels[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(project)}
            disabled={isUpdating}
            aria-label="Edit project"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={async () => {
              try {
                await onArchive(project.id);
              } catch (err) {
                const message =
                  err instanceof Error
                    ? err.message
                    : 'Failed to archive project';
                toast({
                  title: 'Project update failed',
                  description: message,
                });
              }
            }}
            disabled={isArchiving}
            aria-label="Archive project"
          >
            {isArchiving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            <span className="sr-only">Archive</span>
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Milestones</div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMilestoneOpen(true)}
            disabled={isUpdating}
            aria-label="Add milestone"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <MilestonesList
          milestones={project.milestones ?? []}
          startDate={project.startDate}
          targetDate={project.targetDate}
          onUpdate={async (milestoneId, changes) => {
            try {
              await onUpdateMilestone(project.id, milestoneId, changes);
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : 'Failed to update milestone';
              toast({
                title: 'Milestone update failed',
                description:
                  message.replace(/must be true, got: false/i, '').trim() ||
                  message,
              });
            }
          }}
          onArchive={async (milestoneId) => {
            try {
              await onArchiveMilestone(project.id, milestoneId);
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : 'Failed to archive milestone';
              toast({
                title: 'Milestone archive failed',
                description: message,
              });
            }
          }}
          disabled={isUpdating}
        />
      </div>
      <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add milestone</DialogTitle>
          </DialogHeader>
          <ProjectMilestoneInput
            onAdd={async (milestone) => {
              setMilestoneError(null);
              try {
                await onAddMilestone(project.id, milestone);
                setMilestoneOpen(false);
              } catch (err) {
                const message =
                  err instanceof Error
                    ? err.message
                    : 'Failed to add milestone';
                setMilestoneError(message);
              }
            }}
            startDate={project.startDate}
            targetDate={project.targetDate}
          />
          {milestoneError ? (
            <p className="text-sm text-destructive">{milestoneError}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
