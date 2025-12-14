import { useMemo, useState } from 'react';
import { RefreshCw, PlusCircle, Search } from 'lucide-react';
import {
  useGoals,
  useProjects,
  useProjectCommands,
} from '@mo/presentation/react';
import { Button } from '../../components/ui/button';
import { ProjectForm } from '../../components/projects/ProjectForm';
import { ProjectCard } from '../../components/projects/ProjectCard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import type { ProjectListItemDto } from '@mo/application';
import { useToast } from '../../components/ui/toast';

export function ProjectsPage() {
  const { projects, loading, error, refresh } = useProjects();
  const { goals } = useGoals();
  const {
    createProject,
    updateProject,
    archiveProject,
    addMilestone,
    updateMilestone,
    archiveMilestone,
    loading: mutating,
  } = useProjectCommands();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] =
    useState<ProjectListItemDto | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const toast = useToast();

  const activeProjects = useMemo(
    () =>
      projects
        .filter((p) => p.archivedAt === null)
        .filter((p) => {
          if (!search.trim()) return true;
          const needle = search.toLowerCase();
          return (
            p.name.toLowerCase().includes(needle) ||
            (p.description ?? '').toLowerCase().includes(needle)
          );
        }),
    [projects, search]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground shadow-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New project
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refresh()}
            aria-label="Refresh projects"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {search ? (
        <span className="text-xs text-muted-foreground">
          {activeProjects.length} result(s)
        </span>
      ) : null}

      {error && (
        <div className="text-sm text-destructive">
          Failed to load projects: {error}
        </div>
      )}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading projects…</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {activeProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              goals={goals}
              onEdit={(p) => setEditingProject(p)}
              isUpdating={mutating}
              isArchiving={mutating}
              onAddMilestone={async (projectId, milestone) => {
                try {
                  await addMilestone(projectId, milestone);
                  await refresh();
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : 'Failed to add milestone';
                  toast({
                    title: 'Project update failed',
                    description: message,
                  });
                }
              }}
              onUpdateMilestone={async (projectId, milestoneId, changes) => {
                try {
                  await updateMilestone(projectId, milestoneId, changes);
                  await refresh();
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : 'Failed to update milestone';
                  toast({
                    title: 'Project update failed',
                    description: message,
                  });
                }
              }}
              onArchiveMilestone={async (projectId, milestoneId) => {
                try {
                  await archiveMilestone(projectId, milestoneId);
                  await refresh();
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : 'Failed to archive milestone';
                  toast({
                    title: 'Project update failed',
                    description: message,
                  });
                }
              }}
              onUpdate={async (projectId, changes) => {
                try {
                  await updateProject({ projectId, ...changes });
                  await refresh();
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : 'Failed to update project';
                  toast({
                    title: 'Project update failed',
                    description: message,
                  });
                }
              }}
              onArchive={async (projectId) => {
                try {
                  await archiveProject(projectId);
                  await refresh();
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
            />
          ))}
          {activeProjects.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No projects yet. Create one to link goals and milestones.
            </div>
          )}
        </div>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new project by providing name, dates, description, and
              optional goal link.
            </DialogDescription>
          </DialogHeader>
          <ProjectForm
            goals={goals}
            onSubmit={async (values) => {
              setCreateError(null);
              try {
                await createProject(values);
                await refresh();
                setCreateOpen(false);
              } catch (err) {
                const message =
                  err instanceof Error
                    ? err.message
                    : 'Failed to create project';
                setCreateError(message);
              }
            }}
          />
          {createError ? (
            <p className="text-sm text-destructive">{createError}</p>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editingProject}
        onOpenChange={(open) => {
          if (!open) setEditingProject(null);
          setEditError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription className="sr-only">
              Edit project details including name, dates, description, and goal
              link.
            </DialogDescription>
          </DialogHeader>
          {editingProject ? (
            <ProjectForm
              goals={goals}
              initialValues={{
                name: editingProject.name,
                description: editingProject.description,
                startDate: editingProject.startDate,
                targetDate: editingProject.targetDate,
                goalId: editingProject.goalId,
              }}
              submitLabel="Save changes"
              onSubmit={async (values) => {
                setEditError(null);
                try {
                  const changes = { projectId: editingProject.id } as {
                    projectId: string;
                    name?: string;
                    description?: string;
                    startDate?: string;
                    targetDate?: string;
                    goalId?: string | null;
                  };
                  if (values.name !== editingProject.name) {
                    changes.name = values.name;
                  }
                  if (
                    (values.description ?? '') !==
                    (editingProject.description ?? '')
                  ) {
                    changes.description = values.description;
                  }
                  if (
                    values.startDate !== editingProject.startDate ||
                    values.targetDate !== editingProject.targetDate
                  ) {
                    changes.startDate = values.startDate;
                    changes.targetDate = values.targetDate;
                  }
                  if (values.goalId !== editingProject.goalId) {
                    changes.goalId = values.goalId;
                  }

                  // If nothing changed, just close the dialog.
                  const hasChanges =
                    changes.name ||
                    changes.description ||
                    changes.startDate ||
                    changes.targetDate ||
                    changes.goalId !== undefined;

                  if (hasChanges) {
                    await updateProject(changes);
                    await refresh();
                  }
                  setEditingProject(null);
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : 'Failed to update project';
                  setEditError(message);
                }
              }}
            />
          ) : null}
          {editError ? (
            <p className="text-sm text-destructive">{editError}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
