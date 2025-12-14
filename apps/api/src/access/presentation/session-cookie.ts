export const SESSION_COOKIE_NAME = 'mo_session';
export const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const SESSION_COOKIE_SECURE =
  process.env.SESSION_COOKIE_SECURE === 'true' ||
  process.env.NODE_ENV === 'production';

export const parseCookies = (
  header: string | undefined
): Record<string, string> => {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, pair) => {
    const [rawName, ...rest] = pair.trim().split('=');
    if (!rawName || rest.length === 0) return acc;
    const value = rest.join('=');
    acc[decodeURIComponent(rawName)] = decodeURIComponent(value);
    return acc;
  }, {});
};
