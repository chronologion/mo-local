import { describe, expect, it } from 'vitest';
import { ProjectionTaskRunner } from '../../src/projection/ProjectionTaskRunner';

describe('ProjectionTaskRunner', () => {
  it('serializes concurrent processing calls', async () => {
    const runner = new ProjectionTaskRunner('TestRunner', 100);
    const order: string[] = [];

    const first = runner.run(async () => {
      order.push('start-1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('end-1');
    });

    const second = runner.run(async () => {
      order.push('start-2');
      order.push('end-2');
    });

    await Promise.all([first, second]);

    expect(order).toEqual(['start-1', 'end-1']);
  });
});
