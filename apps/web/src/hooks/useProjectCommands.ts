import { useCallback, useState } from 'react';
import { useApp } from '../providers/AppProvider';

export type CreateProjectParams = {
  name: string;
  startDate: string;
  targetDate: string;
  description: string;
  goalId?: string | null;
};

export type UpdateProjectParams = {
  projectId: string;
  status?: 'planned' | 'in_progress' | 'completed' | 'canceled';
  name?: string;
  description?: string;
  startDate?: string;
  targetDate?: string;
  goalId?: string | null;
};

export const useProjectCommands = () => {
  const { services, userMeta } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dispatch = useCallback(
    async (command: { type: string; [key: string]: unknown }) => {
      setLoading(true);
      setError(null);
      const result = await services.projectCommandBus.dispatch(command);
      setLoading(false);
      if (!result.ok) {
        const message =
          result.errors?.map((e) => e.message).join(', ') ??
          'Unknown project command error';
        setError(message);
        throw new Error(message);
      }
      return result.value;
    },
    [services.projectCommandBus]
  );

  const createProject = useCallback(
    async (params: CreateProjectParams) => {
      return dispatch({
        type: 'CreateProject',
        projectId: crypto.randomUUID(),
        name: params.name,
        status: 'planned',
        startDate: params.startDate,
        targetDate: params.targetDate,
        description: params.description,
        goalId: params.goalId ?? null,
        userId: userMeta?.userId ?? 'unknown',
        timestamp: Date.now(),
      });
    },
    [dispatch, userMeta?.userId]
  );

  const updateProject = useCallback(
    async (params: UpdateProjectParams) => {
      const tasks: Array<Promise<unknown>> = [];
      if (params.status) {
        tasks.push(
          dispatch({
            type: 'ChangeProjectStatus',
            projectId: params.projectId,
            status: params.status,
            userId: userMeta?.userId ?? 'unknown',
            timestamp: Date.now(),
          })
        );
      }
      if (params.name) {
        tasks.push(
          dispatch({
            type: 'ChangeProjectName',
            projectId: params.projectId,
            name: params.name,
            userId: userMeta?.userId ?? 'unknown',
            timestamp: Date.now(),
          })
        );
      }
      if (params.description) {
        tasks.push(
          dispatch({
            type: 'ChangeProjectDescription',
            projectId: params.projectId,
            description: params.description,
            userId: userMeta?.userId ?? 'unknown',
            timestamp: Date.now(),
          })
        );
      }
      if (params.startDate || params.targetDate) {
        tasks.push(
          dispatch({
            type: 'ChangeProjectDates',
            projectId: params.projectId,
            startDate: params.startDate,
            targetDate: params.targetDate,
            userId: userMeta?.userId ?? 'unknown',
            timestamp: Date.now(),
          })
        );
      }
      if (params.goalId !== undefined) {
        tasks.push(
          params.goalId
            ? dispatch({
                type: 'AddProjectGoal',
                projectId: params.projectId,
                goalId: params.goalId,
                userId: userMeta?.userId ?? 'unknown',
                timestamp: Date.now(),
              })
            : dispatch({
                type: 'RemoveProjectGoal',
                projectId: params.projectId,
                userId: userMeta?.userId ?? 'unknown',
                timestamp: Date.now(),
              })
        );
      }
      await Promise.all(tasks);
    },
    [dispatch, userMeta?.userId]
  );

  const archiveProject = useCallback(
    async (projectId: string) => {
      return dispatch({
        type: 'ArchiveProject',
        projectId,
        userId: userMeta?.userId ?? 'unknown',
        timestamp: Date.now(),
      });
    },
    [dispatch, userMeta?.userId]
  );

  return {
    createProject,
    updateProject,
    archiveProject,
    addMilestone: async (
      projectId: string,
      milestone: { name: string; targetDate: string }
    ) => {
      return dispatch({
        type: 'AddProjectMilestone',
        projectId,
        milestoneId: crypto.randomUUID(),
        name: milestone.name,
        targetDate: milestone.targetDate,
        userId: userMeta?.userId ?? 'unknown',
        timestamp: Date.now(),
      });
    },
    updateMilestone: async (
      projectId: string,
      milestoneId: string,
      changes: { name?: string; targetDate?: string }
    ) => {
      const tasks: Array<Promise<unknown>> = [];
      if (changes.name) {
        tasks.push(
          dispatch({
            type: 'ChangeProjectMilestoneName',
            projectId,
            milestoneId,
            name: changes.name,
            userId: userMeta?.userId ?? 'unknown',
            timestamp: Date.now(),
          })
        );
      }
      if (changes.targetDate) {
        tasks.push(
          dispatch({
            type: 'ChangeProjectMilestoneTargetDate',
            projectId,
            milestoneId,
            targetDate: changes.targetDate,
            userId: userMeta?.userId ?? 'unknown',
            timestamp: Date.now(),
          })
        );
      }
      await Promise.all(tasks);
    },
    deleteMilestone: async (projectId: string, milestoneId: string) => {
      return dispatch({
        type: 'DeleteProjectMilestone',
        projectId,
        milestoneId,
        userId: userMeta?.userId ?? 'unknown',
        timestamp: Date.now(),
      });
    },
    loading,
    error,
  };
};
