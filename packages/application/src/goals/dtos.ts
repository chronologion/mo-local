import type { PriorityLevel, SliceValue } from '@mo/domain';

export type GoalListItemDto = {
  id: string;
  summary: string;
  slice: SliceValue;
  priority: PriorityLevel;
  targetMonth: string;
  createdAt: number;
  archivedAt: number | null;
};

