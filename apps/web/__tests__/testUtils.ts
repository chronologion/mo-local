import type { AppServices } from '../src/bootstrap/createAppServices';
import { useApp } from '../src/providers/AppProvider';
import { useRemoteAuth } from '../src/providers/RemoteAuthProvider';

type AppContextValue = ReturnType<typeof useApp>;
type RemoteAuthContextValue = ReturnType<typeof useRemoteAuth>;

export const makeServices = (overrides: Partial<AppServices> = {}): AppServices => ({
  // UI tests don't exercise services; provide minimal typed stubs.
  crypto: {} as AppServices['crypto'],
  keyStore: {} as AppServices['keyStore'],
  keyService: {} as AppServices['keyService'],
  keyServiceShutdown: async () => {},
  eventBus: {} as AppServices['eventBus'],
  publisher: {} as AppServices['publisher'],
  storeId: 'test-store',
  db: {} as AppServices['db'],
  dbShutdown: async () => {},
  syncEngine: {} as AppServices['syncEngine'],
  contexts: {},
  ...overrides,
});

export const makeAppContext = (overrides: Partial<AppContextValue> = {}): AppContextValue => ({
  services: makeServices(),
  userMeta: null,
  session: { status: 'ready', userId: 'user-1' },
  completeOnboarding: async () => {},
  unlock: async () => {},
  unlockWithUserPresence: async () => {},
  resetLocalState: async () => {},
  rebuildProjections: async () => {},
  exportKeyVaultBackup: async () => '',
  restoreBackup: async (_params) => {},
  requestKeyService: async () => ({}) as never,
  ...overrides,
});

export const makeRemoteAuthContext = (overrides: Partial<RemoteAuthContextValue> = {}): RemoteAuthContextValue => ({
  state: { status: 'disconnected' },
  error: null,
  signUp: async () => {},
  logIn: async () => {},
  logOut: async () => {},
  refreshSession: async () => {},
  clearError: () => {},
  ...overrides,
});
