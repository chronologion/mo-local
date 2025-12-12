import type { ProjectStatusValue } from '@mo/domain';

export type ProjectListItemDto = {
  id: string;
  name: string;
  status: ProjectStatusValue;
  startDate: string;
  targetDate: string;
  description: string;
  goalId: string | null;
  milestones: { id: string; name: string; targetDate: string }[];
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
};

