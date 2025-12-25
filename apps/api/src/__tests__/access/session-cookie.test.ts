import { describe, expect, it } from 'vitest';
import { parseCookies } from '../../access/presentation/session-cookie';

describe('session cookies', () => {
  it('parses cookie header into key/value pairs', () => {
    const header = 'mo_session=abc123; theme=light';
    expect(parseCookies(header)).toEqual({
      mo_session: 'abc123',
      theme: 'light',
    });
  });

  it('returns empty object for empty header', () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});
