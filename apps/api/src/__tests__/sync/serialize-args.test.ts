import {
  parseArgs,
  serializeArgs,
} from '../../sync/infrastructure/kysely-sync-event.repository';

describe('sync args serialization', () => {
  it('preserves key order on serialize', () => {
    const args = { b: 1, a: 2, c: { d: 3, e: 4 } };
    const serialized = serializeArgs(args);
    expect(serialized).toBe(JSON.stringify(args));
  });

  it('round-trips args without reordering keys', () => {
    const args = { z: 0, a: 1, b: { y: 2, x: 3 } };
    const serialized = serializeArgs(args);
    const parsed = parseArgs(serialized);
    expect(JSON.stringify(parsed)).toBe(serialized);
  });
});
