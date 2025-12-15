import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { CloudIdentitySession, ICloudAccessClient } from '@mo/application';
import { HttpCloudAccessClient } from '@mo/infrastructure/cloud';

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

export type RemoteAuthProviderProps = {
  children: React.ReactNode;
  client?: ICloudAccessClient;
};

export const RemoteAuthProvider = ({
  children,
  client: injectedClient,
}: RemoteAuthProviderProps) => {
  const [state, setState] = useState<RemoteAuthState>({
    status: 'disconnected',
  });
  const [error, setError] = useState<string | null>(null);

  const client: ICloudAccessClient = useMemo(
    () => injectedClient ?? new HttpCloudAccessClient(apiBaseUrl),
    [injectedClient]
  );

  const refreshSession = useCallback(async () => {
    setState({ status: 'connecting' });
    setError(null);
    try {
      const whoami: CloudIdentitySession | null = await client.whoAmI();
      if (whoami) {
        setState({
          status: 'connected',
          identityId: whoami.identityId,
          email: whoami.email,
        });
      } else {
        setState({ status: 'disconnected' });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Session is no longer valid';
      setError(message);
      setState({ status: 'disconnected' });
    }
  }, [client]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signUp = useCallback(
    async (params: { email: string; password: string }) => {
      setState({ status: 'connecting' });
      setError(null);
      try {
        const session = await client.register({
          email: params.email,
          password: params.password,
        });
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
    [client]
  );

  const logIn = useCallback(
    async (params: { email: string; password: string }) => {
      setState({ status: 'connecting' });
      setError(null);
      try {
        const session = await client.login({
          email: params.email,
          password: params.password,
        });
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
    [client]
  );

  const logOut = useCallback(async () => {
    setError(null);
    try {
      await client.logout();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to log out right now';
      setError(message);
    } finally {
      setState({ status: 'disconnected' });
    }
  }, [client]);

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
