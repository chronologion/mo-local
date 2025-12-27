import { describe, expect, it } from 'vitest';
import { ProjectionTaskRunner } from '../../src/projection/ProjectionTaskRunner';

describe('ProjectionTaskRunner', () => {
  it('serializes concurrent processing calls and reruns when requested', async () => {
    const runner = new ProjectionTaskRunner('TestRunner', 100);
    const order: string[] = [];

    const task = async () => {
      order.push('start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('end');
    };

    const first = runner.run(task);
    const second = runner.run(task);

    await Promise.all([first, second]);

    expect(order).toEqual(['start', 'end', 'start', 'end']);
  });

  it('waits for pending reruns before resolving', async () => {
    const runner = new ProjectionTaskRunner('TestRunner', 100);
    const order: string[] = [];
    let callCount = 0;

    const task = async () => {
      callCount += 1;
      const call = callCount;
      order.push(`start-${call}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(`end-${call}`);
    };

    const first = runner.run(task);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = runner.run(task);

    await Promise.all([first, second]);
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('resolves multiple concurrent callers after the cycle completes', async () => {
    const runner = new ProjectionTaskRunner('TestRunner', 100);
    let completed = 0;

    const task = async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      completed += 1;
    };

    const first = runner.run(task);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = runner.run(task);
    const third = runner.run(task);

    await Promise.all([first, second, third]);
    expect(completed).toBe(2);
  });
});
