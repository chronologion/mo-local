import { goalEventTypes } from '../goals/events/eventTypes';
import { projectEventTypes } from '../projects/events/eventTypes';

// Legacy alias for goals; keep for compatibility.
export const eventTypes = goalEventTypes;

export { goalEventTypes, projectEventTypes };
export type { GoalEventType } from '../goals/events/eventTypes';
export type { ProjectEventType } from '../projects/events/eventTypes';
