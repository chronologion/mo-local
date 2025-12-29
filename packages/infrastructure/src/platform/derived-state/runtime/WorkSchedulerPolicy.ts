export type WorkSchedulerPolicy = Readonly<{
  batchSize: number;
  yieldDelayMs: number;
  idleDelayMs: number;
}>;

export const DEFAULT_WORK_SCHEDULER_POLICY: WorkSchedulerPolicy = {
  batchSize: 250,
  yieldDelayMs: 0,
  idleDelayMs: 25,
};

export const yieldToEventLoop = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));
