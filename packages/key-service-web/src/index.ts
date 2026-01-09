import { KeyServiceClient, sendHello, type MessagePortLike } from './client';
import type { KeyServiceRequest, KeyServiceResponse, WorkerHello } from './protocol/types';
import { WorkerHelloKinds } from './protocol/types';

export type {
  SessionId,
  KeyHandle,
  ChangePassphraseRequest,
  CloseHandleRequest,
  CreateVaultRequest,
  DecryptRequest,
  DecryptResponse,
  EncryptRequest,
  EncryptResponse,
  GetUserPresenceUnlockInfoResponse,
  IngestKeyEnvelopeRequest,
  IngestKeyEnvelopeResponse,
  IngestScopeStateRequest,
  IngestScopeStateResponse,
  KeyEnvelopeRef,
  KdfParams,
  KeyServiceRequest,
  KeyServiceResponse,
  ResourceGrantRef,
  SignRequest,
  SignResponse,
  StepUpRequest,
  StepUpResponse,
  UnlockRequest,
  UnlockResponse,
  UserId,
  VerifyRequest,
  VerifyResponse,
  WorkerEnvelope,
  WorkerHelloKind,
  WorkerResponse,
} from './protocol/types';

export type WebKeyServiceOptions = Readonly<{
  storeId: string;
}>;

export type KeyServicePort = {
  request: (payload: KeyServiceRequest) => Promise<KeyServiceResponse>;
  shutdown: () => void;
};

type SharedWorkerLike = {
  port: MessagePortLike & { close?: () => void };
};

type SharedWorkerConstructor = new (url: URL, options: { type: 'module'; name?: string }) => SharedWorkerLike;

const tryInvoke = (value: unknown): void => {
  if (typeof value === 'function') {
    value();
  }
};

export async function createWebKeyService(
  options: WebKeyServiceOptions
): Promise<{ client: KeyServiceClient; shutdown: () => Promise<void> }> {
  if (typeof window === 'undefined') {
    throw new Error('createWebKeyService must be called in a browser context');
  }

  const clientInstanceId = crypto.randomUUID();
  const sharedWorkerSupported = typeof SharedWorker !== 'undefined';
  let worker: Worker | null = null;
  let closeSharedPort: (() => void) | null = null;
  let port: MessagePortLike;

  const createSharedWorkerPort = (): MessagePortLike => {
    const SharedWorkerCtor = SharedWorker as SharedWorkerConstructor;
    const sharedWorker = new SharedWorkerCtor(new URL('./worker/key-service.worker.ts', import.meta.url), {
      type: 'module',
      name: `mo-key-service:${options.storeId}`,
    });
    closeSharedPort = () => sharedWorker.port.close?.();
    return {
      postMessage: (message, transfer) => {
        if (transfer && transfer.length > 0) {
          sharedWorker.port.postMessage(message, transfer);
        } else {
          sharedWorker.port.postMessage(message);
        }
      },
      addEventListener: (type, listener) => sharedWorker.port.addEventListener(type, listener),
      removeEventListener: (type, listener) => sharedWorker.port.removeEventListener(type, listener),
      start: () => sharedWorker.port.start?.(),
    };
  };

  const createDedicatedWorkerPort = (): MessagePortLike => {
    worker = new Worker(new URL('./worker/key-service.worker.ts', import.meta.url), {
      type: 'module',
    });
    return {
      postMessage: (message, transfer) => {
        if (transfer && transfer.length > 0) {
          worker?.postMessage(message, transfer);
        } else {
          worker?.postMessage(message);
        }
      },
      addEventListener: (type, listener) => worker?.addEventListener(type, listener as EventListener),
      removeEventListener: (type, listener) => worker?.removeEventListener(type, listener as EventListener),
    };
  };

  try {
    port = sharedWorkerSupported ? createSharedWorkerPort() : createDedicatedWorkerPort();
  } catch {
    closeSharedPort = null;
    port = createDedicatedWorkerPort();
  }

  const hello: WorkerHello = {
    v: 1,
    kind: WorkerHelloKinds.hello,
    storeId: options.storeId,
    clientInstanceId,
  };

  try {
    await sendHello(port, hello);
  } catch (error) {
    const canFallback = closeSharedPort !== null;
    if (canFallback) {
      try {
        tryInvoke(closeSharedPort);
      } catch {
        // ignore
      }
      closeSharedPort = null;
      port = createDedicatedWorkerPort();
      await sendHello(port, hello);
    } else {
      throw error;
    }
  }
  const client = new KeyServiceClient(port);

  return {
    client,
    shutdown: async () => {
      client.shutdown();
      if (worker) {
        worker.terminate();
      }
      tryInvoke(closeSharedPort);
    },
  };
}

export { KeyServiceClient, WorkerHelloKinds };
