import { z } from 'zod';

export const USER_META_KEY = 'mo-local-user';
export const STORE_ID_KEY = 'mo-local-store-id';

export type UserMeta = {
  /**
   * Stable local identity id (UUIDv4). Used for `actorId` and identity key records.
   */
  userId: string;
  deviceId: string;
};

const userMetaSchema = z.object({
  userId: z.uuid(),
  deviceId: z.string().min(1),
});

export const loadStoredStoreId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORE_ID_KEY);
};

export const loadMeta = (): UserMeta | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(USER_META_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const safe = userMetaSchema.safeParse(parsed);
    if (!safe.success) return null;
    return safe.data;
  } catch {
    return null;
  }
};

export const saveMeta = (meta: UserMeta): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(USER_META_KEY, JSON.stringify(meta));
};

export const clearMeta = (): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(USER_META_KEY);
};
