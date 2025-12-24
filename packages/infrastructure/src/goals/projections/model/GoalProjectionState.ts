import {
  PriorityLevel,
  SliceValue,
  eventTypes,
  GoalCreated,
  GoalRefined,
  GoalRecategorized,
  GoalRescheduled,
  GoalPrioritized,
  GoalArchived,
  GoalAccessGranted,
  GoalAccessRevoked,
  goalEventTypes,
  DomainEvent,
} from '@mo/domain';

export type GoalEvent =
  | GoalCreated
  | GoalRefined
  | GoalRecategorized
  | GoalRescheduled
  | GoalPrioritized
  | GoalArchived
  | GoalAccessGranted
  | GoalAccessRevoked;

const goalEventNames = new Set(Object.values(goalEventTypes) as string[]);

export const isGoalEvent = (event: DomainEvent): event is GoalEvent =>
  goalEventNames.has(event.eventType);

export type GoalListItem = {
  id: string;
  summary: string;
  slice: SliceValue;
  priority: PriorityLevel;
  targetMonth: string;
  createdAt: number;
  archivedAt: number | null;
  version: number;
};

export type GoalSnapshotState = {
  id: string;
  summary: string;
  slice: SliceValue;
  priority: PriorityLevel;
  targetMonth: string;
  createdBy: string;
  createdAt: number;
  archivedAt: number | null;
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
  event: GoalEvent,
  version: number
): GoalSnapshotState | null => {
  switch (event.eventType) {
    case eventTypes.goalCreated:
      return {
        id: event.goalId.value,
        summary: event.summary.value,
        slice: event.slice.value,
        priority: event.priority.level,
        targetMonth: event.targetMonth.value,
        createdBy: event.createdBy.value,
        createdAt: event.createdAt.value,
        archivedAt: null,
        version,
      };
    case eventTypes.goalRefined:
      if (!current) return null;
      return {
        ...current,
        summary: event.summary.value,
        version,
      };
    case eventTypes.goalRecategorized:
      if (!current) return null;
      return {
        ...current,
        slice: event.slice.value,
        version,
      };
    case eventTypes.goalRescheduled:
      if (!current) return null;
      return {
        ...current,
        targetMonth: event.targetMonth.value,
        version,
      };
    case eventTypes.goalPrioritized:
      if (!current) return null;
      return {
        ...current,
        priority: event.priority.level,
        version,
      };
    case eventTypes.goalArchived:
      if (!current) return null;
      return {
        ...current,
        archivedAt: event.archivedAt.value,
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

  const prevActive = previous && previous.archivedAt === null;
  const nextActive = next && next.archivedAt === null;

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
  archivedAt: snapshot.archivedAt,
  version: snapshot.version,
});

const parseYear = (targetMonth: string): number => {
  const [year] = targetMonth.split('-', 2);
  const parsed = Number(year);
  return Number.isFinite(parsed) ? parsed : 0;
};
