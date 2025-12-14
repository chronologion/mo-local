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
      identityId: string;
      email?: string;
    };

type RemoteAuthContextValue = {
  state: RemoteAuthState;
  error: string | null;
  signUp: (params: { email: string; password: string }) => Promise<void>;
  logIn: (params: { email: string; password: string }) => Promise<void>;
  logOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
};

const apiBaseUrl =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  'http://localhost:4000';

const RemoteAuthContext = createContext<RemoteAuthContextValue | null>(null);

const sessionResponseSchema = z.object({
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
    return message.join(' | ');
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
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const payload = await parseJson(response);
  if (!response.ok) {
    const reason =
      extractErrorMessage(payload) ??
      (typeof payload === 'string'
        ? payload
        : (() => {
            try {
              return JSON.stringify(payload);
            } catch {
              return null;
            }
          })());
    const isAuthPath =
      path === '/auth/login' ||
      path === '/auth/register' ||
      path === '/auth/logout';
    let message: string;
    if (reason) {
      const normalized = reason.toLowerCase();
      if (
        path === '/auth/login' &&
        response.status === 400 &&
        (normalized === 'bad request' ||
          normalized.includes('request failed') ||
          normalized.includes('invalid session') ||
          normalized === 'unauthorized')
      ) {
        message = 'Email or password is incorrect.';
      } else {
        message = reason;
      }
    } else if (path === '/auth/login' && response.status === 400) {
      message = 'Email or password is incorrect.';
    } else if (isAuthPath && response.status === 400) {
      message = 'Unable to authenticate with the provided credentials.';
    } else {
      message = `Request to ${path} failed (status ${response.status})`;
    }
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

  const refreshSession = useCallback(async () => {
    setState({ status: 'connecting' });
    setError(null);
    try {
      const whoami = await requestJson(
        '/auth/whoami',
        {
          method: 'GET',
        },
        whoamiResponseSchema
      );
      setState({
        status: 'connected',
        identityId: whoami.identityId,
        email: whoami.email,
      });
    } catch (err) {
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
        setState({
          status: 'connected',
          identityId: session.identityId,
          email: session.email,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to sign up right now';
        setError(message);
        setState({ status: 'disconnected' });
        throw err;
      }
    },
    []
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
        setState({
          status: 'connected',
          identityId: session.identityId,
          email: session.email,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Login failed, try again';
        setError(message);
        setState({ status: 'disconnected' });
        throw err;
      }
    },
    []
  );

  const logOut = useCallback(async () => {
    setError(null);
    try {
      await requestJson(
        '/auth/logout',
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
        logoutResponseSchema
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to log out right now';
      setError(message);
    } finally {
      setState({ status: 'disconnected' });
    }
  }, []);

  const clearError = () => setError(null);

  return (
    <RemoteAuthContext.Provider
      value={{
        state,
        error,
        signUp,
        logIn,
        logOut,
        refreshSession,
        clearError,
      }}
    >
      {children}
    </RemoteAuthContext.Provider>
  );
};

export const useRemoteAuth = (): RemoteAuthContextValue => {
  const ctx = useContext(RemoteAuthContext);
  if (!ctx) throw new Error('RemoteAuthProvider missing');
  return ctx;
};
