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
});
