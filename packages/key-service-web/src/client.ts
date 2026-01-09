import {
  KeyServiceErrorCodes,
  WorkerEnvelopeKinds,
  WorkerHelloKinds,
  WorkerResponseKinds,
  type KeyServiceRequest,
  type KeyServiceResponse,
  type WorkerEnvelope,
  type WorkerHello,
  type WorkerResponse,
} from './protocol/types';

export type MessagePortLike = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  start?: () => void;
};

type PendingRequest = {
  resolve: (data: KeyServiceResponse) => void;
  reject: (error: Error) => void;
};

export class KeyServiceClient {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly onMessage = (event: MessageEvent) => {
    const data = event.data as unknown;
    if (!isWorkerEnvelope(data)) return;
    if (data.kind !== WorkerEnvelopeKinds.response) return;
    this.handleResponse(data);
  };

  constructor(private readonly port: MessagePortLike) {
    this.port.addEventListener('message', this.onMessage);
    this.port.start?.();
  }

  async request(payload: KeyServiceRequest): Promise<KeyServiceResponse> {
    const requestId = crypto.randomUUID();
    const envelope: WorkerEnvelope = {
      v: 1,
      kind: WorkerEnvelopeKinds.request,
      requestId,
      payload,
    };

    const transferables = collectTransferables(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.port.postMessage(envelope, transferables);
    });
  }

  shutdown(): void {
    this.pending.clear();
    this.port.removeEventListener('message', this.onMessage);
  }

  private handleResponse(envelope: WorkerEnvelope): void {
    if (envelope.kind !== WorkerEnvelopeKinds.response) return;
    const pending = this.pending.get(envelope.requestId);
    if (!pending) return;
    this.pending.delete(envelope.requestId);

    const payload = envelope.payload as WorkerResponse;
    if (payload.kind === WorkerResponseKinds.error) {
      const err = new Error(payload.error.message) as Error & {
        code: string;
        context?: Readonly<Record<string, unknown>>;
      };
      err.name = payload.error.code;
      err.code = payload.error.code;
      err.context = payload.error.context;
      pending.reject(err);
      return;
    }

    pending.resolve(payload.data);
  }
}

export async function sendHello(
  port: MessagePortLike,
  message: WorkerHello,
  timeoutMs = 5000
): Promise<Extract<WorkerHello, { kind: typeof WorkerHelloKinds.helloOk }>> {
  port.start?.();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      port.removeEventListener('message', handler);
      reject(new Error('Key service worker hello timeout'));
    }, timeoutMs);

    const handler = (event: MessageEvent) => {
      const data = event.data as unknown;
      if (!isWorkerHello(data)) return;
      if (data.kind === WorkerHelloKinds.helloOk) {
        clearTimeout(timeoutId);
        port.removeEventListener('message', handler);
        resolve(data);
        return;
      }
      if (data.kind === WorkerHelloKinds.helloError) {
        clearTimeout(timeoutId);
        port.removeEventListener('message', handler);
        const err = new Error(data.error.message) as Error & {
          code: string;
          context?: Readonly<Record<string, unknown>>;
        };
        err.name = data.error.code;
        err.code = data.error.code;
        err.context = data.error.context;
        reject(err);
      }
    };

    port.addEventListener('message', handler);
    port.postMessage(message);
  });
}

function isWorkerEnvelope(value: unknown): value is WorkerEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; v?: unknown };
  if (candidate.v !== 1) return false;
  if (candidate.kind !== WorkerEnvelopeKinds.request && candidate.kind !== WorkerEnvelopeKinds.response) return false;
  return true;
}

function isWorkerHello(value: unknown): value is WorkerHello {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; v?: unknown };
  if (candidate.v !== 1) return false;
  return (
    candidate.kind === WorkerHelloKinds.hello ||
    candidate.kind === WorkerHelloKinds.helloOk ||
    candidate.kind === WorkerHelloKinds.helloError
  );
}

function collectTransferables(value: unknown): Transferable[] {
  const transferables: Transferable[] = [];
  const seen = new Set<unknown>();

  const visit = (item: unknown) => {
    if (!item || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (item instanceof Uint8Array) {
      transferables.push(item.buffer);
      return;
    }
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry);
      return;
    }
    for (const entry of Object.values(item as Record<string, unknown>)) {
      visit(entry);
    }
  };

  visit(value);
  return transferables;
}

export function toKeyServiceError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const code = (error as Error & { code?: string }).code ?? KeyServiceErrorCodes.WorkerProtocolError;
    return { code, message: error.message };
  }
  return { code: KeyServiceErrorCodes.WorkerProtocolError, message: 'Unknown error' };
}
