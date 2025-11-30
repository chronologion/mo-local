import { useState } from 'react';
import { SliceValue, uuidv7 } from '@mo/domain';
import { useApp } from '../providers/AppProvider';

type CreateParams = {
  summary: string;
  slice: SliceValue;
  priority: 'must' | 'should' | 'maybe';
  targetMonth: string;
};

type UpdateParams = Partial<CreateParams> & { goalId: string };

export const useGoalCommands = () => {
  const { services, session } = useApp();
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
      const userId = ensureUser();
      const cmd = {
        type: 'CreateGoal' as const,
        goalId: uuidv7(),
        slice: params.slice,
        summary: params.summary,
        targetMonth: params.targetMonth,
        priority: params.priority,
        userId,
        timestamp: Date.now(),
      };
      const result = await services.goalService.handle(cmd);
      if (!result.ok) {
        throw new Error(result.errors.map((e) => e.message).join(', '));
      }
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
      const userId = ensureUser();
      const timestamp = Date.now();
      if (params.summary !== undefined) {
        const cmd = {
          type: 'ChangeGoalSummary' as const,
          goalId: params.goalId,
          summary: params.summary,
          timestamp,
          userId,
        };
        const result = await services.goalService.handle(cmd);
        if (!result.ok) {
          throw new Error(result.errors.map((e) => e.message).join(', '));
        }
      }
      if (params.slice !== undefined) {
        const cmd = {
          type: 'ChangeGoalSlice' as const,
          goalId: params.goalId,
          slice: params.slice,
          timestamp,
          userId,
        };
        const result = await services.goalService.handle(cmd);
        if (!result.ok) {
          throw new Error(result.errors.map((e) => e.message).join(', '));
        }
      }
      if (params.priority !== undefined) {
        const cmd = {
          type: 'ChangeGoalPriority' as const,
          goalId: params.goalId,
          priority: params.priority,
          timestamp,
          userId,
        };
        const result = await services.goalService.handle(cmd);
        if (!result.ok) {
          throw new Error(result.errors.map((e) => e.message).join(', '));
        }
      }
      if (params.targetMonth !== undefined) {
        const cmd = {
          type: 'ChangeGoalTargetMonth' as const,
          goalId: params.goalId,
          targetMonth: params.targetMonth,
          timestamp,
          userId,
        };
        const result = await services.goalService.handle(cmd);
        if (!result.ok) {
          throw new Error(result.errors.map((e) => e.message).join(', '));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteGoal = async (goalId: string) => {
    setLoading(true);
    setError(null);
    try {
      const userId = ensureUser();
      const cmd = {
        type: 'DeleteGoal' as const,
        goalId,
        timestamp: Date.now(),
        userId,
      };
      const result = await services.goalService.handle(cmd);
      if (!result.ok) {
        throw new Error(result.errors.map((e) => e.message).join(', '));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createGoal, updateGoal, deleteGoal, loading, error };
};
