import { useState } from 'react';
import { SliceValue, uuidv7 } from '@mo/domain';
import {
  AchieveGoal,
  ArchiveGoal,
  ChangeGoalPriority,
  ChangeGoalSlice,
  ChangeGoalSummary,
  ChangeGoalTargetMonth,
  CreateGoal,
  GetGoalByIdQuery,
  UnachieveGoal,
} from '@mo/application';
import { useInterface } from '../context';

type CreateParams = {
  summary: string;
  slice: SliceValue;
  priority: 'must' | 'should' | 'maybe';
  targetMonth: string;
};

type UpdateParams = Partial<CreateParams> & { goalId: string };

export const useGoalCommands = () => {
  const { services, session } = useInterface();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ensureUser = () => {
    if (session.status !== 'ready') {
      throw new Error('User not ready');
    }
    return session.userId;
  };

  const createGoal = async (params: CreateParams) => {
    setLoading(true);
    setError(null);
    try {
      const actorId = ensureUser();
      const cmd = new CreateGoal({
        goalId: uuidv7(),
        slice: params.slice,
        summary: params.summary,
        targetMonth: params.targetMonth,
        priority: params.priority,
        actorId,
        timestamp: Date.now(),
        idempotencyKey: uuidv7(),
      });
      const result = await services.goalCommandBus.dispatch(cmd);
      if (!result.ok) {
        throw new Error(
          result.errors
            .map((err: { message: string }) => err.message)
            .join(', ')
        );
      }
      await services.goalProjection.whenReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateGoal = async (params: UpdateParams) => {
    setLoading(true);
    setError(null);
    try {
      const actorId = ensureUser();
      const timestamp = Date.now();
      const result = await services.goalQueryBus.dispatch(
        new GetGoalByIdQuery(params.goalId)
      );
      if (Array.isArray(result)) {
        throw new Error('Invalid query result');
      }
      const current = result;
      if (!current) {
        throw new Error('Goal not found');
      }
      let knownVersion = current.version;
      let changed = false;
      if (params.summary !== undefined && params.summary !== current.summary) {
        const cmd = new ChangeGoalSummary({
          goalId: params.goalId,
          summary: params.summary,
          timestamp,
          actorId,
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        const result = await services.goalCommandBus.dispatch(cmd);
        if (!result.ok) {
          throw new Error(
            result.errors
              .map((err: { message: string }) => err.message)
              .join(', ')
          );
        }
        changed = true;
        knownVersion += 1;
      }
      if (params.slice !== undefined && params.slice !== current.slice) {
        const cmd = new ChangeGoalSlice({
          goalId: params.goalId,
          slice: params.slice,
          timestamp,
          actorId,
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        const result = await services.goalCommandBus.dispatch(cmd);
        if (!result.ok) {
          throw new Error(
            result.errors
              .map((err: { message: string }) => err.message)
              .join(', ')
          );
        }
        changed = true;
        knownVersion += 1;
      }
      if (
        params.priority !== undefined &&
        params.priority !== current.priority
      ) {
        const cmd = new ChangeGoalPriority({
          goalId: params.goalId,
          priority: params.priority,
          timestamp,
          actorId,
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        const result = await services.goalCommandBus.dispatch(cmd);
        if (!result.ok) {
          throw new Error(
            result.errors
              .map((err: { message: string }) => err.message)
              .join(', ')
          );
        }
        changed = true;
        knownVersion += 1;
      }
      if (
        params.targetMonth !== undefined &&
        params.targetMonth !== current.targetMonth
      ) {
        const cmd = new ChangeGoalTargetMonth({
          goalId: params.goalId,
          targetMonth: params.targetMonth,
          timestamp,
          actorId,
          knownVersion,
          idempotencyKey: uuidv7(),
        });
        const result = await services.goalCommandBus.dispatch(cmd);
        if (!result.ok) {
          throw new Error(
            result.errors
              .map((err: { message: string }) => err.message)
              .join(', ')
          );
        }
        changed = true;
        knownVersion += 1;
      }
      if (changed) {
        await services.goalProjection.whenReady();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const archiveGoal = async (goalId: string) => {
    setLoading(true);
    setError(null);
    try {
      const actorId = ensureUser();
      const current = await services.goalQueryBus.dispatch(
        new GetGoalByIdQuery(goalId)
      );
      if (Array.isArray(current)) {
        throw new Error('Invalid query result');
      }
      if (!current) {
        throw new Error('Goal not found');
      }
      const cmd = new ArchiveGoal({
        goalId,
        timestamp: Date.now(),
        actorId,
        knownVersion: current.version,
        idempotencyKey: uuidv7(),
      });
      const result = await services.goalCommandBus.dispatch(cmd);
      if (!result.ok) {
        throw new Error(
          result.errors
            .map((err: { message: string }) => err.message)
            .join(', ')
        );
      }
      await services.goalProjection.whenReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const achieveGoal = async (goalId: string) => {
    setLoading(true);
    setError(null);
    try {
      const actorId = ensureUser();
      const current = await services.goalQueryBus.dispatch(
        new GetGoalByIdQuery(goalId)
      );
      if (Array.isArray(current)) {
        throw new Error('Invalid query result');
      }
      if (!current) {
        throw new Error('Goal not found');
      }
      const cmd = new AchieveGoal({
        goalId,
        timestamp: Date.now(),
        actorId,
        knownVersion: current.version,
        idempotencyKey: uuidv7(),
      });
      const result = await services.goalCommandBus.dispatch(cmd);
      if (!result.ok) {
        throw new Error(
          result.errors
            .map((err: { message: string }) => err.message)
            .join(', ')
        );
      }
      await services.goalProjection.whenReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const unachieveGoal = async (goalId: string) => {
    setLoading(true);
    setError(null);
    try {
      const actorId = ensureUser();
      const current = await services.goalQueryBus.dispatch(
        new GetGoalByIdQuery(goalId)
      );
      if (Array.isArray(current)) {
        throw new Error('Invalid query result');
      }
      if (!current) {
        throw new Error('Goal not found');
      }
      const cmd = new UnachieveGoal({
        goalId,
        timestamp: Date.now(),
        actorId,
        knownVersion: current.version,
        idempotencyKey: uuidv7(),
      });
      const result = await services.goalCommandBus.dispatch(cmd);
      if (!result.ok) {
        throw new Error(
          result.errors
            .map((err: { message: string }) => err.message)
            .join(', ')
        );
      }
      await services.goalProjection.whenReady();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    createGoal,
    updateGoal,
    archiveGoal,
    achieveGoal,
    unachieveGoal,
    loading,
    error,
  };
};
