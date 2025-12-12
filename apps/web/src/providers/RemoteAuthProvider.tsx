import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { z } from 'zod';

type RemoteAuthState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | {
      status: 'connected';
      sessionToken: string;
      identityId: string;
      email?: string;
    };

type RemoteAuthContextValue = {
  state: RemoteAuthState;
  error: string | null;
  signUp: (params: { email: string; password: string }) => Promise<void>;
  logIn: (params: { email: string; password: string }) => Promise<void>;
  logOut: () => Promise<void>;
  getSessionToken: () => string | null;
  refreshSession: () => Promise<void>;
  clearError: () => void;
};

const SESSION_STORAGE_KEY = 'mo-remote-session-token';
const apiBaseUrl =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  'http://localhost:4000';

const RemoteAuthContext = createContext<RemoteAuthContextValue | null>(null);

const safeGetStoredToken = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(SESSION_STORAGE_KEY);
};

const persistSessionToken = (token: string): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SESSION_STORAGE_KEY, token);
};

const clearStoredSessionToken = (): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
};

type SessionResponse = {
  sessionToken: string;
  identityId: string;
  email?: string;
};

const sessionResponseSchema = z.object({
  sessionToken: z.string(),
  identityId: z.string(),
  email: z.string().optional(),
});

const whoamiResponseSchema = z.object({
  identityId: z.string(),
  email: z.string().optional(),
});

const logoutResponseSchema = z.object({
  revoked: z.boolean(),
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return text;
  }
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (!isObject(payload)) return null;
  if (isObject(payload.error) && typeof payload.error.message === 'string') {
    return payload.error.message;
  }
  const message = payload.message;
  if (typeof message === 'string') {
    return message;
  }
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === 'string')
  ) {
    return message.join(', ');
  }
  return null;
};

const requestJson = async <T,>(
  path: string,
  init: RequestInit,
  schema: z.ZodSchema<T>
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    const reason = extractErrorMessage(payload);
    const message =
      reason ?? `Request to ${path} failed (status ${response.status})`;
    throw new Error(message);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Unexpected response from ${path}`);
  }
  return parsed.data;
};

export const RemoteAuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [state, setState] = useState<RemoteAuthState>({
    status: 'disconnected',
  });
  const [error, setError] = useState<string | null>(null);

  const adoptSession = useCallback((session: SessionResponse) => {
    persistSessionToken(session.sessionToken);
    setState({
      status: 'connected',
      sessionToken: session.sessionToken,
      identityId: session.identityId,
      email: session.email,
    });
  }, []);

  const refreshSession = useCallback(async () => {
    const storedToken = safeGetStoredToken();
    if (!storedToken) {
      setState({ status: 'disconnected' });
      return;
    }
    setState({ status: 'connecting' });
    setError(null);
    try {
      const whoami = await requestJson(
        '/auth/whoami',
        {
          method: 'GET',
          headers: { 'x-session-token': storedToken },
        },
        whoamiResponseSchema
      );
      setState({
        status: 'connected',
        sessionToken: storedToken,
        identityId: whoami.identityId,
        email: whoami.email,
      });
    } catch (err) {
      clearStoredSessionToken();
      const message =
        err instanceof Error ? err.message : 'Session is no longer valid';
      setError(message);
      setState({ status: 'disconnected' });
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signUp = useCallback(
    async (params: { email: string; password: string }) => {
      setState({ status: 'connecting' });
      setError(null);
      try {
        const session = await requestJson(
          '/auth/register',
          {
            method: 'POST',
            body: JSON.stringify({
              email: params.email,
              password: params.password,
            }),
          },
          sessionResponseSchema
        );
        adoptSession(session);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to sign up right now';
        setError(message);
        setState({ status: 'disconnected' });
        throw err;
      }
    },
    [adoptSession]
  );

  const logIn = useCallback(
    async (params: { email: string; password: string }) => {
      setState({ status: 'connecting' });
      setError(null);
      try {
        const session = await requestJson(
          '/auth/login',
          {
            method: 'POST',
            body: JSON.stringify({
              email: params.email,
              password: params.password,
            }),
          },
          sessionResponseSchema
        );
        adoptSession(session);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Login failed, try again';
        setError(message);
        setState({ status: 'disconnected' });
        throw err;
      }
    },
    [adoptSession]
  );

  const logOut = useCallback(async () => {
    const token = state.status === 'connected' ? state.sessionToken : null;
    setError(null);
    try {
      if (token) {
        await requestJson(
          '/auth/logout',
          {
            method: 'POST',
            body: JSON.stringify({ sessionToken: token }),
          },
          logoutResponseSchema
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to logout session';
      setError(message);
    } finally {
      clearStoredSessionToken();
      setState({ status: 'disconnected' });
    }
  }, [state]);

  const getSessionToken = useCallback(() => {
    if (state.status === 'connected') {
      return state.sessionToken;
    }
    return safeGetStoredToken();
  }, [state]);

  const clearError = useCallback(() => setError(null), []);

  const value: RemoteAuthContextValue = {
    state,
    error,
    signUp,
    logIn,
    logOut,
    getSessionToken,
    refreshSession,
    clearError,
  };

  return (
    <RemoteAuthContext.Provider value={value}>
      {children}
    </RemoteAuthContext.Provider>
  );
};

export const useRemoteAuth = (): RemoteAuthContextValue => {
  const ctx = useContext(RemoteAuthContext);
  if (!ctx) {
    throw new Error('RemoteAuthProvider missing');
  }
  return ctx;
};
