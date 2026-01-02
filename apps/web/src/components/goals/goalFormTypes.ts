import { SliceValue } from '@mo/domain';

export type GoalFormValues = {
  summary: string;
  slice: SliceValue;
  priority: 'must' | 'should' | 'maybe';
  targetMonth: string;
};

export const sliceOptions: SliceValue[] = [
  'Health',
  'Family',
  'Relationships',
  'Work',
  'Money',
  'Learning',
  'Mindfulness',
  'Leisure',
];

export const priorityOptions: Array<GoalFormValues['priority']> = ['must', 'should', 'maybe'];

export const getDefaultTargetMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
