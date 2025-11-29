import {
  GoalAccessGranted,
  GoalAccessRevoked,
  GoalCreated,
  GoalDeleted,
  GoalPriorityChanged,
  GoalSliceChanged,
  GoalSummaryChanged,
  GoalTargetChanged,
} from '@mo/domain';
import { MaterializedState } from './types';

type SupportedEvent =
  | GoalCreated
  | GoalSummaryChanged
  | GoalSliceChanged
  | GoalTargetChanged
  | GoalPriorityChanged
  | GoalDeleted
  | GoalAccessGranted
  | GoalAccessRevoked;

/**
 * Applies goal-related domain events to materialized state.
 */
export const applyGoalEvent = (
  state: MaterializedState,
  event: SupportedEvent
): void => {
  switch (event.eventType) {
    case 'GoalCreated':
      state.goals.set(event.aggregateId, {
        id: event.aggregateId,
        slice: event.payload.slice,
        summary: event.payload.summary,
        target_month: event.payload.targetMonth,
        priority: event.payload.priority,
        created_by: event.payload.createdBy,
        created_at: event.occurredAt.getTime(),
        deleted_at: null,
        version: 1,
      });
      break;
    case 'GoalSummaryChanged': {
      const row = state.goals.get(event.aggregateId);
      if (!row) break;
      state.goals.set(event.aggregateId, {
        ...row,
        summary: event.payload.summary,
        version: row.version + 1,
      });
      break;
    }
    case 'GoalSliceChanged': {
      const row = state.goals.get(event.aggregateId);
      if (!row) break;
      state.goals.set(event.aggregateId, {
        ...row,
        slice: event.payload.slice,
        version: row.version + 1,
      });
      break;
    }
    case 'GoalTargetChanged': {
      const row = state.goals.get(event.aggregateId);
      if (!row) break;
      state.goals.set(event.aggregateId, {
        ...row,
        target_month: event.payload.targetMonth,
        version: row.version + 1,
      });
      break;
    }
    case 'GoalPriorityChanged': {
      const row = state.goals.get(event.aggregateId);
      if (!row) break;
      state.goals.set(event.aggregateId, {
        ...row,
        priority: event.payload.priority,
        version: row.version + 1,
      });
      break;
    }
    case 'GoalDeleted': {
      const row = state.goals.get(event.aggregateId);
      if (!row) break;
      state.goals.set(event.aggregateId, {
        ...row,
        deleted_at: event.occurredAt.getTime(),
        version: row.version + 1,
      });
      break;
    }
    case 'GoalAccessGranted': {
      const id = `${event.aggregateId}:${event.payload.grantedTo}`;
      state.goalAccess.set(id, {
        id,
        goal_id: event.aggregateId,
        user_id: event.payload.grantedTo,
        permission: event.payload.permission,
        granted_at: event.occurredAt.getTime(),
        revoked_at: null,
      });
      break;
    }
    case 'GoalAccessRevoked': {
      const id = `${event.aggregateId}:${event.payload.revokedFrom}`;
      const row = state.goalAccess.get(id);
      if (!row) break;
      state.goalAccess.set(id, {
        ...row,
        revoked_at: event.occurredAt.getTime(),
      });
      break;
    }
    default:
      break;
  }
};
