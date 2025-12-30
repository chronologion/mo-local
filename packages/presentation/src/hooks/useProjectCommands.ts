import { useCallback, useState } from 'react';
import { uuidv7 } from '@mo/domain';
import { GetProjectByIdQuery, type ProjectCommand } from '@mo/application';
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
    if (session.status === 'ready') {
      if (session.userId) return session.userId;
      throw new Error('Unlock your local vault before editing projects');
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
        const errorMessage =
          result.errors
            ?.map((err) => err.message)
            .filter((msg) => msg && msg.trim().length > 0)
            .join(', ') || 'Unknown project command error';
        // Surface details in dev console to aid debugging of silent failures.
        console.error('[ProjectCommandBus] Dispatch failed', {
          command,
          errors: result.errors,
          message: errorMessage,
        });
        setError(errorMessage);
        throw new Error(errorMessage);
      }
      return result.value;
    },
    [services.projectCommandBus]
  );

  const loadKnownVersion = useCallback(
    async (projectId: string): Promise<number> => {
      const current = await services.projectQueryBus.dispatch(
        new GetProjectByIdQuery(projectId)
      );
      if (Array.isArray(current)) {
        throw new Error('Invalid query result');
      }
      if (!current) {
        throw new Error('Project not found');
      }
      return current.version;
    },
    [services.projectQueryBus]
  );

  const createProject = useCallback(
    async (params: CreateProjectParams) => {
      const actorId = ensureUserId();
      return dispatch({
        type: 'CreateProject',
        projectId: uuidv7(),
        name: params.name,
        status: 'planned',
        startDate: params.startDate,
        targetDate: params.targetDate,
        description: params.description,
        goalId: params.goalId ?? null,
        actorId,
        timestamp: Date.now(),
        idempotencyKey: uuidv7(),
      });
    },
    [dispatch, ensureUserId]
  );

  const updateProject = useCallback(
    async (params: UpdateProjectParams) => {
      const actorId = ensureUserId();
      let knownVersion = await loadKnownVersion(params.projectId);
      if (params.status) {
        await dispatch({
          type: 'ChangeProjectStatus',
          projectId: params.projectId,
          status: params.status,
          actorId,
          timestamp: Date.now(),
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        knownVersion += 1;
      }
      if (params.name) {
        await dispatch({
          type: 'ChangeProjectName',
          projectId: params.projectId,
          name: params.name,
          actorId,
          timestamp: Date.now(),
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        knownVersion += 1;
      }
      if (params.description) {
        await dispatch({
          type: 'ChangeProjectDescription',
          projectId: params.projectId,
          description: params.description,
          actorId,
          timestamp: Date.now(),
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        knownVersion += 1;
      }
      if (params.startDate !== undefined || params.targetDate !== undefined) {
        if (!params.startDate || !params.targetDate) {
          throw new Error(
            'Both start and target dates are required to change project dates'
          );
        }
        await dispatch({
          type: 'ChangeProjectDates',
          projectId: params.projectId,
          startDate: params.startDate,
          targetDate: params.targetDate,
          actorId,
          timestamp: Date.now(),
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        knownVersion += 1;
      }
      if (params.goalId !== undefined) {
        if (params.goalId) {
          await dispatch({
            type: 'AddProjectGoal',
            projectId: params.projectId,
            goalId: params.goalId,
            actorId,
            timestamp: Date.now(),
            knownVersion,
            idempotencyKey: uuidv7(),
          });
        } else {
          await dispatch({
            type: 'RemoveProjectGoal',
            projectId: params.projectId,
            actorId,
            timestamp: Date.now(),
            knownVersion,
            idempotencyKey: uuidv7(),
          });
        }
        knownVersion += 1;
      }
    },
    [dispatch, ensureUserId, loadKnownVersion]
  );

  const archiveProject = useCallback(
    async (projectId: string) => {
      const actorId = ensureUserId();
      const knownVersion = await loadKnownVersion(projectId);
      return dispatch({
        type: 'ArchiveProject',
        projectId,
        actorId,
        timestamp: Date.now(),
        knownVersion,
        idempotencyKey: uuidv7(),
      });
    },
    [dispatch, ensureUserId, loadKnownVersion]
  );

  const addMilestone = useCallback(
    async (
      projectId: string,
      milestone: { name: string; targetDate: string }
    ) => {
      const actorId = ensureUserId();
      const knownVersion = await loadKnownVersion(projectId);
      return dispatch({
        type: 'AddProjectMilestone',
        projectId,
        milestoneId: uuidv7(),
        name: milestone.name,
        targetDate: milestone.targetDate,
        actorId,
        timestamp: Date.now(),
        knownVersion,
        idempotencyKey: uuidv7(),
      });
    },
    [dispatch, ensureUserId, loadKnownVersion]
  );

  const updateMilestone = useCallback(
    async (
      projectId: string,
      milestoneId: string,
      changes: { name?: string; targetDate?: string }
    ) => {
      const actorId = ensureUserId();
      let knownVersion = await loadKnownVersion(projectId);
      if (changes.name) {
        await dispatch({
          type: 'ChangeProjectMilestoneName',
          projectId,
          milestoneId,
          name: changes.name,
          actorId,
          timestamp: Date.now(),
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        knownVersion += 1;
      }
      if (changes.targetDate) {
        await dispatch({
          type: 'ChangeProjectMilestoneTargetDate',
          projectId,
          milestoneId,
          targetDate: changes.targetDate,
          actorId,
          timestamp: Date.now(),
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        knownVersion += 1;
      }
    },
    [dispatch, ensureUserId, loadKnownVersion]
  );

  const archiveMilestone = useCallback(
    async (projectId: string, milestoneId: string) => {
      const actorId = ensureUserId();
      const knownVersion = await loadKnownVersion(projectId);
      return dispatch({
        type: 'ArchiveProjectMilestone',
        projectId,
        milestoneId,
        actorId,
        timestamp: Date.now(),
        knownVersion,
        idempotencyKey: uuidv7(),
      });
    },
    [dispatch, ensureUserId, loadKnownVersion]
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
