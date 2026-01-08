import { describe, it, expect } from 'vitest';
import { uuidv4 } from '../../src/utils/uuid';

describe('uuidv4', () => {
  it('generates a valid UUID string', () => {
    const id = uuidv4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('sets version to 4 and RFC 4122 variant', () => {
    const id = uuidv4();
    // xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
    const chars = id.replace(/-/g, '');
    const versionChar = chars[12];
    const variantChar = chars[16];

    expect(versionChar).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(variantChar);
  });
});
