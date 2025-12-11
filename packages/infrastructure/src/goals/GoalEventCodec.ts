import {
  GoalAccessGranted,
  GoalAccessRevoked,
  GoalArchived,
  GoalCreated,
  GoalPriorityChanged,
  GoalSliceChanged,
  GoalSummaryChanged,
  GoalTargetChanged,
  GoalEventType,
  goalEventTypes,
  DomainEvent,
} from '@mo/domain';

export type SerializedGoalEvent = {
  aggregateId: string;
  eventType: GoalEventType;
  payloadVersion: number;
  occurredAt: number;
  streamVersion: number;
  payload: unknown;
};

type StoredGoalPayload = {
  eventType: GoalEventType;
  version: number;
  payload: unknown;
};

type UpcastStep = (event: StoredGoalPayload) => StoredGoalPayload;

// Latest payload version per goal event type. All start at 1.
const GOAL_LATEST_VERSION: Record<GoalEventType, number> = {
  [goalEventTypes.goalCreated]: 1,
  [goalEventTypes.goalSummaryChanged]: 1,
  [goalEventTypes.goalSliceChanged]: 1,
  [goalEventTypes.goalTargetChanged]: 1,
  [goalEventTypes.goalPriorityChanged]: 1,
  [goalEventTypes.goalArchived]: 1,
  [goalEventTypes.goalAccessGranted]: 1,
  [goalEventTypes.goalAccessRevoked]: 1,
};

// Version-to-version upcast steps per event type.
// Empty for now; will be populated when we introduce v2+ payloads.
const GOAL_UPCASTERS: Partial<
  Record<GoalEventType, Record<number, UpcastStep>>
> = {};

const upcastToLatest = (stored: StoredGoalPayload): StoredGoalPayload => {
  const latest = GOAL_LATEST_VERSION[stored.eventType];
  const stepsForType = GOAL_UPCASTERS[stored.eventType] ?? {};

  let current = stored;
  while (current.version < latest) {
    const step = stepsForType[current.version];
    if (!step) {
      throw new Error(
        `Missing upcast step for ${current.eventType} v${current.version} -> v${
          current.version + 1
        }`
      );
    }
    current = step(current);
  }

  if (current.version !== latest) {
    throw new Error(
      `Unsupported payloadVersion ${current.version} for ${current.eventType}`
    );
  }

  return current;
};

const HYDRATORS: Record<GoalEventType, (payload: unknown) => DomainEvent> = {
  [goalEventTypes.goalCreated]: (payload) =>
    GoalCreated.fromJSON(payload as ReturnType<GoalCreated['toJSON']>),
  [goalEventTypes.goalSummaryChanged]: (payload) =>
    GoalSummaryChanged.fromJSON(
      payload as ReturnType<GoalSummaryChanged['toJSON']>
    ),
  [goalEventTypes.goalSliceChanged]: (payload) =>
    GoalSliceChanged.fromJSON(
      payload as ReturnType<GoalSliceChanged['toJSON']>
    ),
  [goalEventTypes.goalTargetChanged]: (payload) =>
    GoalTargetChanged.fromJSON(
      payload as ReturnType<GoalTargetChanged['toJSON']>
    ),
  [goalEventTypes.goalPriorityChanged]: (payload) =>
    GoalPriorityChanged.fromJSON(
      payload as ReturnType<GoalPriorityChanged['toJSON']>
    ),
  [goalEventTypes.goalArchived]: (payload) =>
    GoalArchived.fromJSON(payload as ReturnType<GoalArchived['toJSON']>),
  [goalEventTypes.goalAccessGranted]: (payload) =>
    GoalAccessGranted.fromJSON(
      payload as ReturnType<GoalAccessGranted['toJSON']>
    ),
  [goalEventTypes.goalAccessRevoked]: (payload) =>
    GoalAccessRevoked.fromJSON(
      payload as ReturnType<GoalAccessRevoked['toJSON']>
    ),
};

export const GoalEventCodec = {
  serialize(
    event: DomainEvent & { eventType: GoalEventType; toJSON(): unknown },
    streamVersion: number
  ): SerializedGoalEvent {
    const payloadVersion = GOAL_LATEST_VERSION[event.eventType];
    return {
      aggregateId: event.aggregateId.value,
      eventType: event.eventType,
      payloadVersion,
      occurredAt: event.occurredAt.value,
      streamVersion,
      payload: event.toJSON(),
    };
  },

  deserialize(
    eventType: GoalEventType,
    payloadVersion: number,
    rawPayload: unknown
  ): DomainEvent {
    const latest = upcastToLatest({
      eventType,
      version: payloadVersion,
      payload: rawPayload,
    });

    const hydrate = HYDRATORS[eventType];
    if (!hydrate) {
      throw new Error(`Unsupported event type: ${eventType}`);
    }

    return hydrate(latest.payload);
  },
};
