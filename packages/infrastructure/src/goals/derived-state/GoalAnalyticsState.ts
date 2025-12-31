import { SliceValue } from '@mo/domain';

export type MonthlyTotals = Record<string, Record<SliceValue, number>>;
export type CategoryRollups = Record<number, Record<SliceValue, number>>;

export type AnalyticsPayload = {
  monthlyTotals: MonthlyTotals;
  categoryRollups: CategoryRollups;
};

export const createEmptyAnalytics = (): AnalyticsPayload => ({
  monthlyTotals: {},
  categoryRollups: {},
});

export const applyMonthlyDelta = (
  totals: MonthlyTotals,
  yearMonth: string,
  slice: SliceValue,
  delta: number
): MonthlyTotals => {
  const bucket = totals[yearMonth] ?? {};
  const nextValue = (bucket[slice] ?? 0) + delta;
  const nextBucket = { ...bucket };
  if (nextValue === 0) {
    delete nextBucket[slice];
  } else {
    nextBucket[slice] = nextValue;
  }
  const nextTotals = { ...totals };
  if (Object.keys(nextBucket).length === 0) {
    delete nextTotals[yearMonth];
  } else {
    nextTotals[yearMonth] = nextBucket;
  }
  return nextTotals;
};

export const applyCategoryDelta = (
  rollups: CategoryRollups,
  year: number,
  slice: SliceValue,
  delta: number
): CategoryRollups => {
  const bucket = rollups[year] ?? {};
  const nextValue = (bucket[slice] ?? 0) + delta;
  const nextBucket = { ...bucket };
  if (nextValue === 0) {
    delete nextBucket[slice];
  } else {
    nextBucket[slice] = nextValue;
  }
  const nextRollups = { ...rollups };
  if (Object.keys(nextBucket).length === 0) {
    delete nextRollups[year];
  } else {
    nextRollups[year] = nextBucket;
  }
  return nextRollups;
};
