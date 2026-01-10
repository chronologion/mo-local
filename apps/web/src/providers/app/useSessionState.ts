import { useEffect, useState } from 'react';
import { uuidv4 } from '@mo/domain';
import type { SessionId } from '@mo/key-service-web';
import { z } from 'zod';
import { loadMeta, loadStoredStoreId, STORE_ID_KEY, type UserMeta } from './localMeta';

type SessionState =
  | { status: 'loading' }
  | { status: 'needs-onboarding' }
  | { status: 'locked'; userId: string }
  | {
      status: 'ready';
      userId: string;
    };

type UseSessionStateReturn = {
  session: SessionState;
  setSession: React.Dispatch<React.SetStateAction<SessionState>>;
  userMeta: UserMeta | null;
  setUserMeta: React.Dispatch<React.SetStateAction<UserMeta | null>>;
  keyStoreReady: boolean;
  setKeyStoreReady: React.Dispatch<React.SetStateAction<boolean>>;
  keyServiceSessionId: SessionId | null;
  setKeyServiceSessionId: React.Dispatch<React.SetStateAction<SessionId | null>>;
  storeId: string | null;
  setStoreId: React.Dispatch<React.SetStateAction<string | null>>;
};

const storeIdSchema = z.uuid();

export function useSessionState(): UseSessionStateReturn {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [userMeta, setUserMeta] = useState<UserMeta | null>(null);
  const [keyStoreReady, setKeyStoreReady] = useState(false);
  const [keyServiceSessionId, setKeyServiceSessionId] = useState<SessionId | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    const meta = loadMeta();
    const storedStoreId = loadStoredStoreId();
    if (meta) {
      setUserMeta(meta);
      setSession({ status: 'locked', userId: meta.userId });
      setKeyStoreReady(false);
      setKeyServiceSessionId(null);
      const nextStoreId = meta.userId;
      if (typeof localStorage !== 'undefined' && storedStoreId !== nextStoreId) {
        localStorage.setItem(STORE_ID_KEY, nextStoreId);
      }
      setStoreId(nextStoreId);
      return;
    }

    setUserMeta(null);
    setSession({ status: 'needs-onboarding' });
    setKeyStoreReady(false);
    setKeyServiceSessionId(null);
    const fallbackStoreId = (() => {
      if (storedStoreId) {
        const parsed = storeIdSchema.safeParse(storedStoreId);
        if (parsed.success) return parsed.data;
      }
      return uuidv4();
    })();
    if (typeof localStorage !== 'undefined' && storedStoreId !== fallbackStoreId) {
      localStorage.setItem(STORE_ID_KEY, fallbackStoreId);
    }
    setStoreId(fallbackStoreId);
  }, []);

  useEffect(() => {
    if (session.status !== 'ready') {
      setKeyStoreReady(false);
      setKeyServiceSessionId(null);
    }
  }, [session.status]);

  return {
    session,
    setSession,
    userMeta,
    setUserMeta,
    keyStoreReady,
    setKeyStoreReady,
    keyServiceSessionId,
    setKeyServiceSessionId,
    storeId,
    setStoreId,
  };
}
