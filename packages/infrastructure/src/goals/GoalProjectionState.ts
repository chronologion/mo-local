import {
  PriorityLevel,
  SliceValue,
  eventTypes,
  GoalCreated,
  GoalSummaryChanged,
  GoalSliceChanged,
  GoalTargetChanged,
  GoalPriorityChanged,
  GoalArchived,
  GoalAccessGranted,
  GoalAccessRevoked,
} from '@mo/domain';

export type SupportedGoalEvent =
  | GoalCreated
  | GoalSummaryChanged
  | GoalSliceChanged
  | GoalTargetChanged
  | GoalPriorityChanged
  | GoalArchived
  | GoalAccessGranted
  | GoalAccessRevoked;

export type GoalListItem = {
  id: string;
  summary: string;
  slice: SliceValue;
  priority: PriorityLevel;
  targetMonth: string;
  createdAt: number;
  deletedAt: number | null;
};

export type GoalSnapshotState = {
  id: string;
  summary: string;
  slice: SliceValue;
  priority: PriorityLevel;
  targetMonth: string;
  createdBy: string;
  createdAt: number;
  deletedAt: number | null;
  version: number;
};

export type AnalyticsDelta = {
  monthly: Array<{ yearMonth: string; slice: SliceValue; delta: number }>;
  category: Array<{ year: number; slice: SliceValue; delta: number }>;
};

/**
 * Applies a domain event to the snapshot state. Returns the updated snapshot
 * or null if no snapshot can be produced (e.g., missing create).
 */
export const applyEventToSnapshot = (
  current: GoalSnapshotState | null,
  event: SupportedGoalEvent,
  version: number
): GoalSnapshotState | null => {
  switch (event.eventType) {
    case eventTypes.goalCreated:
      return {
        id: event.payload.goalId,
        summary: event.payload.summary,
        slice: event.payload.slice,
        priority: event.payload.priority,
        targetMonth: event.payload.targetMonth,
        createdBy: event.payload.createdBy,
        createdAt: event.payload.createdAt.getTime(),
        deletedAt: null,
        version,
      };
    case eventTypes.goalSummaryChanged:
      if (!current) return null;
      return {
        ...current,
        summary: event.payload.summary,
        version,
      };
    case eventTypes.goalSliceChanged:
      if (!current) return null;
      return {
        ...current,
        slice: event.payload.slice,
        version,
      };
    case eventTypes.goalTargetChanged:
      if (!current) return null;
      return {
        ...current,
        targetMonth: event.payload.targetMonth,
        version,
      };
    case eventTypes.goalPriorityChanged:
      if (!current) return null;
      return {
        ...current,
        priority: event.payload.priority,
        version,
      };
    case eventTypes.goalArchived:
      if (!current) return null;
      return {
        ...current,
        deletedAt: event.payload.deletedAt.getTime(),
        version,
      };
    case eventTypes.goalAccessGranted:
    case eventTypes.goalAccessRevoked:
      // Access events do not affect the goal snapshot payload but advance version.
      return current ? { ...current, version } : null;
    default:
      return current;
  }
};

/**
 * Computes analytics deltas for monthly totals and category rollups based on
 * a state transition. Negative deltas are used for removals, positive for inserts.
 */
export const buildAnalyticsDeltas = (
  previous: GoalSnapshotState | null,
  next: GoalSnapshotState | null
): AnalyticsDelta => {
  const deltas: AnalyticsDelta = { monthly: [], category: [] };

  const prevActive = previous && previous.deletedAt === null;
  const nextActive = next && next.deletedAt === null;

  const prevMonth = prevActive ? previous.targetMonth : null;
  const nextMonth = nextActive ? next.targetMonth : null;
  const prevSlice = prevActive ? previous.slice : null;
  const nextSlice = nextActive ? next.slice : null;

  if (
    prevMonth &&
    prevSlice &&
    (!nextMonth || prevMonth !== nextMonth || prevSlice !== nextSlice)
  ) {
    deltas.monthly.push({ yearMonth: prevMonth, slice: prevSlice, delta: -1 });
    deltas.category.push({
      year: parseYear(prevMonth),
      slice: prevSlice,
      delta: -1,
    });
  }

  if (
    nextMonth &&
    nextSlice &&
    (!prevMonth || prevMonth !== nextMonth || prevSlice !== nextSlice)
  ) {
    deltas.monthly.push({ yearMonth: nextMonth, slice: nextSlice, delta: 1 });
    deltas.category.push({
      year: parseYear(nextMonth),
      slice: nextSlice,
      delta: 1,
    });
  }

  return deltas;
};

export const snapshotToListItem = (
  snapshot: GoalSnapshotState
): GoalListItem => ({
  id: snapshot.id,
  summary: snapshot.summary,
  slice: snapshot.slice,
  priority: snapshot.priority,
  targetMonth: snapshot.targetMonth,
  createdAt: snapshot.createdAt,
  deletedAt: snapshot.deletedAt,
});

const parseYear = (targetMonth: string): number => {
  const [year] = targetMonth.split('-', 2);
  const parsed = Number(year);
  return Number.isFinite(parsed) ? parsed : 0;
};
