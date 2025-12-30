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
  private pending = false;
  private completionPromise: Promise<void> | null = null;
  private resolveCompletion: (() => void) | null = null;

  constructor(
    private readonly label: string,
    private readonly warnThresholdMs: number
  ) {}

  async run(task: () => Promise<void>): Promise<void> {
    // Track the full processing cycle (including pending reruns), so callers
    // can reliably await "fully caught up" semantics (e.g. flush/rebuild flows).
    if (this.completionPromise) {
      this.pending = true;
      await this.completionPromise;
      return;
    }

    this.completionPromise = new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });

    try {
      do {
        this.pending = false;
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
                  `[${this.label}] Task processing exceeded budget`,
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
      } while (this.pending);
    } finally {
      this.resolveCompletion?.();
      this.completionPromise = null;
      this.resolveCompletion = null;
    }
  }
}
