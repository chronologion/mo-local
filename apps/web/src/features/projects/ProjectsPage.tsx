import { useMemo, useState } from 'react';
import { RefreshCw, PlusCircle } from 'lucide-react';
import { useProjects } from '../../hooks/useProjects';
import { useProjectCommands } from '../../hooks/useProjectCommands';
import { useGoals } from '../../hooks/useGoals';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { ProjectForm } from '../../components/projects/ProjectForm';
import { ProjectCard } from '../../components/projects/ProjectCard';

export function ProjectsPage() {
  const { projects, loading, error, refresh } = useProjects();
  const { goals } = useGoals();
  const {
    createProject,
    updateProject,
    archiveProject,
    addMilestone,
    updateMilestone,
    deleteMilestone,
    loading: mutating,
    error: mutationError,
  } = useProjectCommands();
  const [showForm, setShowForm] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.deletedAt === null),
    [projects]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Projects</h2>
          <p className="text-sm text-muted-foreground">
            Day-precision timelines, optional goal linkage, milestones coming next.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowForm((prev) => !prev)}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            {showForm ? 'Hide form' : 'New project'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refresh()}>
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>Create project</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectForm
              goals={goals}
              onSubmit={async (values) => {
                await createProject(values);
                await refresh();
                setShowForm(false);
              }}
              />
            </CardContent>
          </Card>
        )}

      {error && (
        <div className="text-sm text-destructive">Failed to load projects: {error}</div>
      )}
      {(mutationError || uiError) && (
        <div className="text-sm text-destructive">
          Project mutation failed: {uiError ?? mutationError}
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
              isUpdating={mutating}
              isArchiving={mutating}
              onAddMilestone={async (projectId, milestone) => {
                setUiError(null);
                try {
                  await addMilestone(projectId, milestone);
                  await refresh();
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : 'Failed to add milestone';
                  setUiError(message);
                }
              }}
              onUpdateMilestone={async (projectId, milestoneId, changes) => {
                setUiError(null);
                try {
                  await updateMilestone(projectId, milestoneId, changes);
                  await refresh();
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : 'Failed to update milestone';
                  setUiError(message);
                }
              }}
              onDeleteMilestone={async (projectId, milestoneId) => {
                setUiError(null);
                try {
                  await deleteMilestone(projectId, milestoneId);
                  await refresh();
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : 'Failed to delete milestone';
                  setUiError(message);
                }
              }}
              onUpdate={async (projectId, changes) => {
                setUiError(null);
                try {
                  await updateProject({ projectId, ...changes });
                  await refresh();
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : 'Failed to update project';
                  setUiError(message);
                }
              }}
              onArchive={async (projectId) => {
                setUiError(null);
                try {
                  await archiveProject(projectId);
                  await refresh();
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : 'Failed to archive project';
                  setUiError(message);
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
    </div>
  );
}
