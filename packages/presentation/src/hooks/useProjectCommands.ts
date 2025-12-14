import { useCallback, useState } from 'react';
import { uuidv7 } from '@mo/domain';
import type { ProjectCommand } from '@mo/application';
import { useInterface } from '../context';

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
  const { services, session } = useInterface();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureUserId = () => {
    if (session.status === 'ready' && session.userId) {
      return session.userId;
    }
    throw new Error('Unlock your local vault before editing projects');
  };

  const dispatch = useCallback(
    async (command: ProjectCommand) => {
      setLoading(true);
      setError(null);
      const result = await services.projectCommandBus.dispatch(command);
      setLoading(false);
      if (!result.ok) {
        const message =
          result.errors?.map((err) => err.message).join(', ') ??
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
      const userId = ensureUserId();
      return dispatch({
        type: 'CreateProject',
        projectId: uuidv7(),
        name: params.name,
        status: 'planned',
        startDate: params.startDate,
        targetDate: params.targetDate,
        description: params.description,
        goalId: params.goalId ?? null,
        userId,
        timestamp: Date.now(),
      });
    },
    [dispatch, ensureUserId]
  );

  const updateProject = useCallback(
    async (params: UpdateProjectParams) => {
      const userId = ensureUserId();
      const tasks: Array<Promise<unknown>> = [];
      if (params.status) {
        tasks.push(
          dispatch({
            type: 'ChangeProjectStatus',
            projectId: params.projectId,
            status: params.status,
            userId,
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
            userId,
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
            userId,
            timestamp: Date.now(),
          })
        );
      }
      if (params.startDate !== undefined || params.targetDate !== undefined) {
        if (!params.startDate || !params.targetDate) {
          throw new Error(
            'Both start and target dates are required to change project dates'
          );
        }
        tasks.push(
          dispatch({
            type: 'ChangeProjectDates',
            projectId: params.projectId,
            startDate: params.startDate,
            targetDate: params.targetDate,
            userId,
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
                userId,
                timestamp: Date.now(),
              })
            : dispatch({
                type: 'RemoveProjectGoal',
                projectId: params.projectId,
                userId,
                timestamp: Date.now(),
              })
        );
      }
      await Promise.all(tasks);
    },
    [dispatch, ensureUserId]
  );

  const archiveProject = useCallback(
    async (projectId: string) => {
      const userId = ensureUserId();
      return dispatch({
        type: 'ArchiveProject',
        projectId,
        userId,
        timestamp: Date.now(),
      });
    },
    [dispatch, ensureUserId]
  );

  const addMilestone = useCallback(
    async (
      projectId: string,
      milestone: { name: string; targetDate: string }
    ) => {
      const userId = ensureUserId();
      return dispatch({
        type: 'AddProjectMilestone',
        projectId,
        milestoneId: uuidv7(),
        name: milestone.name,
        targetDate: milestone.targetDate,
        userId,
        timestamp: Date.now(),
      });
    },
    [dispatch, ensureUserId]
  );

  const updateMilestone = useCallback(
    async (
      projectId: string,
      milestoneId: string,
      changes: { name?: string; targetDate?: string }
    ) => {
      const userId = ensureUserId();
      const tasks: Array<Promise<unknown>> = [];
      if (changes.name) {
        tasks.push(
          dispatch({
            type: 'ChangeProjectMilestoneName',
            projectId,
            milestoneId,
            name: changes.name,
            userId,
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
            userId,
            timestamp: Date.now(),
          })
        );
      }
      await Promise.all(tasks);
    },
    [dispatch, ensureUserId]
  );

  const archiveMilestone = useCallback(
    async (projectId: string, milestoneId: string) => {
      const userId = ensureUserId();
      return dispatch({
        type: 'ArchiveProjectMilestone',
        projectId,
        milestoneId,
        userId,
        timestamp: Date.now(),
      });
    },
    [dispatch, ensureUserId]
  );

  return {
    createProject,
    updateProject,
    archiveProject,
    addMilestone,
    updateMilestone,
    archiveMilestone,
    loading,
    error,
  };
};
