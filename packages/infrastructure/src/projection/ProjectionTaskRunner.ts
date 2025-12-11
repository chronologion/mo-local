const safeNow = (): number | null => {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now();
  }
  return null;
};

export class ProjectionTaskRunner {
  private processingPromise: Promise<void> | null = null;

  constructor(
    private readonly label: string,
    private readonly warnThresholdMs: number
  ) {}

  async run(task: () => Promise<void>): Promise<void> {
    if (this.processingPromise) {
      await this.processingPromise;
      return;
    }

    const start = safeNow();
    this.processingPromise = task();

    try {
      await this.processingPromise;
      if (start !== null) {
        const end = safeNow();
        if (end !== null) {
          const durationMs = end - start;
          if (durationMs > this.warnThresholdMs) {
            console.warn(
              `[${this.label}] Projection processing exceeded budget`,
              {
                durationMs,
                budgetMs: this.warnThresholdMs,
              }
            );
          }
        }
      }
    } finally {
      this.processingPromise = null;
    }
  }
}
