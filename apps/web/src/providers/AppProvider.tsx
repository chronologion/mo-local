import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { uuidv7 } from '@mo/domain';
import {
  GoalApplicationService,
  GoalCommandHandler,
  IEventBus,
  IEventStore,
  IKeyStore,
} from '@mo/application';
import {
  IndexedDBKeyStore,
  WebCryptoService,
} from '@mo/infrastructure/browser';
import { InMemoryEventBus } from '@mo/application';
import { LocalEventStore } from '../services/LocalEventStore';
import { GoalQueries } from '../services/GoalQueries';
import { GoalRepository } from '../services/GoalRepository';

const USER_META_KEY = 'mo-local-user';

type UserMeta = {
  userId: string;
  pwdSalt: string;
};

type SessionState =
  | { status: 'loading' }
  | { status: 'needs-onboarding' }
  | {
      status: 'ready';
      userId: string;
    };

type Services = {
  crypto: WebCryptoService;
  keyStore: IKeyStore;
  eventStore: IEventStore;
  eventBus: IEventBus;
  goalRepo: GoalRepository;
  goalService: GoalApplicationService;
  goalQueries: GoalQueries;
};

type AppContextValue = {
  services: Services;
  session: SessionState;
  completeOnboarding: (params: { password: string }) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

const loadMeta = (): UserMeta | null => {
  const raw = localStorage.getItem(USER_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserMeta;
  } catch {
    return null;
  }
};

const saveMeta = (meta: UserMeta): void => {
  localStorage.setItem(USER_META_KEY, JSON.stringify(meta));
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const services = useMemo<Services>(() => {
    const crypto = new WebCryptoService();
    const keyStore = new IndexedDBKeyStore();
    const eventStore = new LocalEventStore();
    const eventBus = new InMemoryEventBus();
    const goalRepo = new GoalRepository(
      eventStore,
      crypto,
      async (aggregateId: string) => keyStore.getAggregateKey(aggregateId)
    );
    const goalHandler = new GoalCommandHandler(
      goalRepo,
      keyStore,
      crypto,
      eventBus
    );
    const goalService = new GoalApplicationService(goalHandler);
    const goalQueries = new GoalQueries(eventStore, goalRepo);

    return {
      crypto,
      keyStore,
      eventStore,
      eventBus,
      goalRepo,
      goalService,
      goalQueries,
    };
  }, []);

  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = loadMeta();
      if (!meta) {
        if (!cancelled) setSession({ status: 'needs-onboarding' });
        return;
      }
      const keys = await services.keyStore.getIdentityKeys(meta.userId);
      if (!keys) {
        if (!cancelled) setSession({ status: 'needs-onboarding' });
        return;
      }
      if (!cancelled) {
        setSession({ status: 'ready', userId: meta.userId });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services.keyStore]);

  const completeOnboarding = async ({ password }: { password: string }) => {
    const userId = uuidv7();
    const salt =
      globalThis.crypto?.getRandomValues(new Uint8Array(16)) ||
      new Uint8Array(16).map(() => Math.floor(Math.random() * 256));

    // Derive K_pwd (not yet used in UI flows, but computed for parity with PRD)
    await services.crypto.deriveKeyFromPassword(password, salt);

    const signing = await services.crypto.generateSigningKeyPair();
    const encryption = await services.crypto.generateEncryptionKeyPair();

    await services.keyStore.saveIdentityKeys(userId, {
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
      encryptionPrivateKey: encryption.privateKey,
      encryptionPublicKey: encryption.publicKey,
    });

    saveMeta({ userId, pwdSalt: btoa(String.fromCharCode(...salt)) });
    setSession({ status: 'ready', userId });
  };

  return (
    <AppContext.Provider value={{ services, session, completeOnboarding }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppProvider missing');
  return ctx;
};
