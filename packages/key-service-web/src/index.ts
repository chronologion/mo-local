import { KeyServiceClient, sendHello, type MessagePortLike } from './client';
import type { KeyServiceRequest, KeyServiceResponse, WorkerHello } from './protocol/types';
import { WorkerHelloKinds } from './protocol/types';

export type {
  SessionId,
  KeyHandle,
  ChangePassphraseRequest,
  CloseHandleRequest,
  DecryptRequest,
  DecryptResponse,
  EncryptRequest,
  EncryptResponse,
  GetWebAuthnPrfUnlockInfoResponse,
  IngestKeyEnvelopeRequest,
  IngestKeyEnvelopeResponse,
  IngestScopeStateRequest,
  IngestScopeStateResponse,
  KeyServiceRequest,
  KeyServiceResponse,
  SignRequest,
  SignResponse,
  StepUpRequest,
  StepUpResponse,
  UnlockRequest,
  UnlockResponse,
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

export async function createWebKeyService(
  options: WebKeyServiceOptions
): Promise<{ client: KeyServiceClient; shutdown: () => Promise<void> }> {
  if (typeof window === 'undefined') {
    throw new Error('createWebKeyService must be called in a browser context');
  }

  const worker = new Worker(new URL('./worker/key-service.worker.ts', import.meta.url), {
    type: 'module',
  });

  const port: MessagePortLike = {
    postMessage: (message, transfer) => {
      if (transfer && transfer.length > 0) {
        worker.postMessage(message, transfer);
      } else {
        worker.postMessage(message);
      }
    },
    addEventListener: (type, listener) => worker.addEventListener(type, listener as EventListener),
    removeEventListener: (type, listener) => worker.removeEventListener(type, listener as EventListener),
  };

  const clientInstanceId = crypto.randomUUID();
  const hello: WorkerHello = {
    v: 1,
    kind: WorkerHelloKinds.hello,
    storeId: options.storeId,
    clientInstanceId,
  };

  await sendHello(port, hello);
  const client = new KeyServiceClient(port);

  return {
    client,
    shutdown: async () => {
      client.shutdown();
      worker.terminate();
    },
  };
}

export { KeyServiceClient, WorkerHelloKinds };
