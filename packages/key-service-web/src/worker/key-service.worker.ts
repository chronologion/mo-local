import init, { KeyServiceWasm } from '@mo/key-service-wasm';
import wasmUrl from '@mo/key-service-wasm/mo_key_service_wasm_bg.wasm?url';
import {
  KeyServiceErrorCodes,
  WorkerEnvelopeKinds,
  WorkerHelloKinds,
  WorkerResponseKinds,
  type KeyServiceError,
  type KeyServiceErrorCode,
  type KeyServiceRequest,
  type KeyServiceResponse,
  type KeyHandle,
  type ScopeEpoch,
  type ScopeId,
  type SessionId,
  type UnlockResponse,
  type StepUpResponse,
  type RenewSessionResponse,
  type GetUserPresenceUnlockInfoResponse,
  type IngestScopeStateResponse,
  type IngestKeyEnvelopeResponse,
  type SignResponse,
  type WorkerEnvelope,
  type WorkerHello,
} from '../protocol/types';
import { KeyServiceStorage, type StorageEntry } from './storage';

type PortLike = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  start?: () => void;
};

type KeyServiceRuntime = {
  service: KeyServiceWasm;
  storage: KeyServiceStorage;
};

type ClientState = {
  clientInstanceId: string;
  activeSessionId: string | null;
};

class KeyServiceHost {
  private runtimePromise: Promise<KeyServiceRuntime> | null = null;
  private serverInstanceId: string | null = null;
  private storeId: string | null = null;
  private readonly clients = new WeakMap<PortLike, ClientState>();

  attachPort(port: PortLike): void {
    const handler = (event: MessageEvent) => {
      void this.handleMessage(port, event);
    };
    port.addEventListener('message', handler);
    port.start?.();
  }

  private async handleMessage(port: PortLike, event: MessageEvent): Promise<void> {
    const data = event.data as unknown;
    if (isWorkerHello(data)) {
      await this.handleHello(port, data);
      return;
    }
    if (!isWorkerEnvelope(data)) return;
    await this.handleEnvelope(port, data);
  }

  private async handleHello(port: PortLike, message: WorkerHello): Promise<void> {
    if (message.kind !== WorkerHelloKinds.hello) {
      return;
    }
    if (!isValidStoreId(message.storeId)) {
      const response: WorkerHello = {
        v: 1,
        kind: WorkerHelloKinds.helloError,
        error: {
          code: KeyServiceErrorCodes.WorkerProtocolError,
          message: 'Invalid key service store id',
        },
      };
      port.postMessage(response);
      return;
    }
    if (this.storeId && this.storeId !== message.storeId) {
      const response: WorkerHello = {
        v: 1,
        kind: WorkerHelloKinds.helloError,
        error: {
          code: KeyServiceErrorCodes.WorkerProtocolError,
          message: 'Key service worker store mismatch',
        },
      };
      port.postMessage(response);
      return;
    }

    if (!this.runtimePromise) {
      this.storeId = message.storeId;
      this.runtimePromise = createRuntime(message.storeId);
    }
    this.serverInstanceId ||= crypto.randomUUID();

    try {
      await this.runtimePromise;
      this.clients.set(port, {
        clientInstanceId: message.clientInstanceId,
        activeSessionId: null,
      });
      const response: WorkerHello = {
        v: 1,
        kind: WorkerHelloKinds.helloOk,
        protocolVersion: 1,
        serverInstanceId: this.serverInstanceId,
      };
      port.postMessage(response);
    } catch (error) {
      const response: WorkerHello = {
        v: 1,
        kind: WorkerHelloKinds.helloError,
        error: toKeyServiceError(error, KeyServiceErrorCodes.WorkerProtocolError),
      };
      port.postMessage(response);
    }
  }

  private async handleEnvelope(port: PortLike, envelope: WorkerEnvelope): Promise<void> {
    if (envelope.kind !== WorkerEnvelopeKinds.request) return;

    if (!this.runtimePromise) {
      const response: WorkerEnvelope = {
        v: 1,
        kind: WorkerEnvelopeKinds.response,
        requestId: envelope.requestId,
        payload: {
          kind: WorkerResponseKinds.error,
          error: {
            code: KeyServiceErrorCodes.WorkerNotReady,
            message: 'Key service worker not ready',
          },
        },
      };
      port.postMessage(response);
      return;
    }

    const clientState = this.clients.get(port);
    if (!clientState) {
      const response: WorkerEnvelope = {
        v: 1,
        kind: WorkerEnvelopeKinds.response,
        requestId: envelope.requestId,
        payload: {
          kind: WorkerResponseKinds.error,
          error: {
            code: KeyServiceErrorCodes.WorkerNotReady,
            message: 'Key service client not initialized',
          },
        },
      };
      port.postMessage(response);
      return;
    }

    let runtime: KeyServiceRuntime;
    try {
      runtime = await this.runtimePromise;
    } catch (error) {
      const response: WorkerEnvelope = {
        v: 1,
        kind: WorkerEnvelopeKinds.response,
        requestId: envelope.requestId,
        payload: {
          kind: WorkerResponseKinds.error,
          error: toKeyServiceError(error, KeyServiceErrorCodes.WorkerProtocolError),
        },
      };
      port.postMessage(response);
      return;
    }

    try {
      const data = await handleRequest(runtime, clientState, envelope.payload);
      const response: WorkerEnvelope = {
        v: 1,
        kind: WorkerEnvelopeKinds.response,
        requestId: envelope.requestId,
        payload: {
          kind: WorkerResponseKinds.ok,
          data,
        },
      };
      const transferables = collectTransferables(data);
      port.postMessage(response, transferables);
    } catch (error) {
      const response: WorkerEnvelope = {
        v: 1,
        kind: WorkerEnvelopeKinds.response,
        requestId: envelope.requestId,
        payload: {
          kind: WorkerResponseKinds.error,
          error: toKeyServiceError(error, KeyServiceErrorCodes.WasmError),
        },
      };
      port.postMessage(response);
    }
  }
}

async function handleRequest(
  runtime: KeyServiceRuntime,
  clientState: ClientState,
  request: KeyServiceRequest
): Promise<KeyServiceResponse> {
  const service = runtime.service;
  switch (request.type) {
    case 'createVault': {
      const passphraseUtf8 = request.payload.passphraseUtf8;
      try {
        service.createVault(request.payload.userId, passphraseUtf8, request.payload.kdfParams);
      } finally {
        passphraseUtf8.fill(0);
      }
      await persistWrites(runtime);
      return { type: 'createVault', payload: {} };
    }
    case 'unlock': {
      const payload = request.payload;
      const response =
        payload.method === 'passphrase'
          ? (() => {
              const passphraseUtf8 = payload.passphraseUtf8;
              try {
                return service.unlockPassphrase(passphraseUtf8);
              } finally {
                passphraseUtf8.fill(0);
              }
            })()
          : (() => {
              const userPresenceSecret = payload.userPresenceSecret;
              try {
                return service.unlockUserPresence(userPresenceSecret);
              } finally {
                userPresenceSecret.fill(0);
              }
            })();
      const unlockResponse = parseUnlockResponse(response);
      clientState.activeSessionId = unlockResponse.sessionId;
      await persistWrites(runtime);
      return { type: 'unlock', payload: unlockResponse };
    }
    case 'stepUp': {
      const passphraseUtf8 = request.payload.passphraseUtf8;
      const response = (() => {
        try {
          return parseStepUpResponse(service.stepUp(request.payload.sessionId, passphraseUtf8));
        } finally {
          passphraseUtf8.fill(0);
        }
      })();
      await persistWrites(runtime);
      return { type: 'stepUp', payload: response };
    }
    case 'getUserPresenceUnlockInfo': {
      const response = parseUserPresenceInfo(service.getUserPresenceUnlockInfo());
      return { type: 'getUserPresenceUnlockInfo', payload: response };
    }
    case 'renewSession': {
      const response = parseRenewResponse(service.renewSession(request.payload.sessionId));
      await persistWrites(runtime);
      return { type: 'renewSession', payload: response };
    }
    case 'lock': {
      service.lock(request.payload.sessionId);
      if (clientState.activeSessionId === request.payload.sessionId) {
        clientState.activeSessionId = null;
      }
      await persistWrites(runtime);
      return { type: 'lock', payload: {} };
    }
    case 'exportKeyVault': {
      const blob = ensureUint8Array(service.exportKeyVault(request.payload.sessionId), 'exportKeyVault');
      return { type: 'exportKeyVault', payload: { blob } };
    }
    case 'importKeyVault': {
      service.importKeyVault(request.payload.sessionId, request.payload.blob);
      await persistWrites(runtime);
      return { type: 'importKeyVault', payload: {} };
    }
    case 'changePassphrase': {
      const passphraseUtf8 = request.payload.newPassphraseUtf8;
      try {
        service.changePassphrase(request.payload.sessionId, passphraseUtf8);
      } finally {
        passphraseUtf8.fill(0);
      }
      await persistWrites(runtime);
      return { type: 'changePassphrase', payload: {} };
    }
    case 'storeAppMasterKey': {
      const masterKey = request.payload.masterKey;
      try {
        service.storeAppMasterKey(request.payload.sessionId, masterKey);
      } finally {
        masterKey.fill(0);
      }
      await persistWrites(runtime);
      return { type: 'storeAppMasterKey', payload: {} };
    }
    case 'getAppMasterKey': {
      const masterKey = ensureUint8Array(service.getAppMasterKey(request.payload.sessionId), 'getAppMasterKey');
      return { type: 'getAppMasterKey', payload: { masterKey } };
    }
    case 'enableUserPresenceUnlock': {
      service.enableUserPresenceUnlock(
        request.payload.sessionId,
        request.payload.credentialId,
        request.payload.userPresenceSecret
      );
      await persistWrites(runtime);
      return { type: 'enableUserPresenceUnlock', payload: {} };
    }
    case 'disableUserPresenceUnlock': {
      service.disableUserPresenceUnlock(request.payload.sessionId);
      await persistWrites(runtime);
      return { type: 'disableUserPresenceUnlock', payload: {} };
    }
    case 'ingestScopeState': {
      const response = service.ingestScopeState(
        request.payload.sessionId,
        request.payload.scopeStateCbor,
        request.payload.expectedOwnerSignerFingerprint ?? null
      );
      const parsed = parseIngestScopeStateResponse(response);
      await persistWrites(runtime);
      return { type: 'ingestScopeState', payload: parsed };
    }
    case 'ingestKeyEnvelope': {
      const response = parseIngestKeyEnvelopeResponse(
        service.ingestKeyEnvelope(request.payload.sessionId, request.payload.keyEnvelopeCbor)
      );
      await persistWrites(runtime);
      return { type: 'ingestKeyEnvelope', payload: response };
    }
    case 'openScope': {
      const scopeKeyHandle = ensureString(
        service.openScope(request.payload.sessionId, request.payload.scopeId, request.payload.scopeEpoch),
        'openScope'
      );
      await persistWrites(runtime);
      return { type: 'openScope', payload: { scopeKeyHandle: asKeyHandle(scopeKeyHandle) } };
    }
    case 'openResource': {
      const resourceKeyHandle = ensureString(
        service.openResource(request.payload.sessionId, request.payload.scopeKeyHandle, request.payload.grantCbor),
        'openResource'
      );
      await persistWrites(runtime);
      return { type: 'openResource', payload: { resourceKeyHandle: asKeyHandle(resourceKeyHandle) } };
    }
    case 'closeHandle': {
      service.closeHandle(request.payload.sessionId, request.payload.keyHandle);
      await persistWrites(runtime);
      return { type: 'closeHandle', payload: {} };
    }
    case 'encrypt': {
      const ciphertext = ensureUint8Array(
        service.encrypt(
          request.payload.sessionId,
          request.payload.resourceKeyHandle,
          request.payload.aad,
          request.payload.plaintext
        ),
        'encrypt'
      );
      return { type: 'encrypt', payload: { ciphertext } };
    }
    case 'decrypt': {
      const plaintext = ensureUint8Array(
        service.decrypt(
          request.payload.sessionId,
          request.payload.resourceKeyHandle,
          request.payload.aad,
          request.payload.ciphertext
        ),
        'decrypt'
      );
      return { type: 'decrypt', payload: { plaintext } };
    }
    case 'sign': {
      const response = parseSignResponse(service.sign(request.payload.sessionId, request.payload.data));
      return { type: 'sign', payload: response };
    }
    case 'verify': {
      const ok = ensureBoolean(
        service.verify(
          request.payload.scopeId,
          request.payload.signerDeviceId,
          request.payload.data,
          request.payload.signature,
          request.payload.ciphersuite
        ),
        'verify'
      );
      return { type: 'verify', payload: { ok } };
    }
    case 'signal': {
      const sessionId = request.payload.sessionId ?? clientState.activeSessionId;
      if (sessionId) {
        try {
          service.lock(sessionId);
          if (clientState.activeSessionId === sessionId) {
            clientState.activeSessionId = null;
          }
          await persistWrites(runtime);
        } catch {
          // best-effort signal handling
        }
      }
      return { type: 'signal', payload: {} };
    }
  }
}

async function createRuntime(storeId: string): Promise<KeyServiceRuntime> {
  await init(wasmUrl);
  const storage = new KeyServiceStorage(storeId);
  const entries = await storage.loadAll();
  const service = new KeyServiceWasm();
  service.loadStorage(entries);
  return {
    service,
    storage,
  };
}

async function persistWrites(runtime: KeyServiceRuntime): Promise<void> {
  const rawEntries = runtime.service.drainStorageWrites() as unknown;
  const entries = parseStorageEntries(rawEntries);
  await runtime.storage.putEntries(entries);
}

function parseStorageEntries(value: unknown): StorageEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: StorageEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid storage entry');
    }
    const record = item as { namespace?: unknown; key?: unknown; value?: unknown };
    if (
      typeof record.namespace !== 'string' ||
      typeof record.key !== 'string' ||
      !(record.value instanceof Uint8Array)
    ) {
      throw new Error('Invalid storage entry shape');
    }
    entries.push({ namespace: record.namespace, key: record.key, value: record.value });
  }
  return entries;
}

function isWorkerEnvelope(value: unknown): value is WorkerEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; v?: unknown; requestId?: unknown };
  if (candidate.v !== 1) return false;
  if (candidate.kind !== WorkerEnvelopeKinds.request && candidate.kind !== WorkerEnvelopeKinds.response) return false;
  return typeof candidate.requestId === 'string';
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

function toKeyServiceError(error: unknown, fallbackCode: KeyServiceErrorCode): KeyServiceError {
  if (isKeyServiceError(error)) {
    return error;
  }
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown; context?: unknown };
    if (typeof candidate.code === 'string' && typeof candidate.message === 'string') {
      return {
        code: isKeyServiceErrorCode(candidate.code) ? candidate.code : fallbackCode,
        message: candidate.message,
        context: isContext(candidate.context) ? candidate.context : undefined,
      };
    }
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message,
    };
  }
  return {
    code: fallbackCode,
    message: 'Unknown error',
  };
}

function isContext(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isKeyServiceErrorCode(code: string): code is KeyServiceErrorCode {
  return Object.values(KeyServiceErrorCodes).includes(code as KeyServiceErrorCode);
}

function isKeyServiceError(value: unknown): value is KeyServiceError {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
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

function isValidStoreId(storeId: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(storeId);
}

const isSharedWorker = 'onconnect' in self;
const host = new KeyServiceHost();

if (isSharedWorker && 'onconnect' in self) {
  const sharedScope = self as SharedWorkerGlobalScope;
  sharedScope.onconnect = (event) => {
    const port = (event as MessageEvent & { ports: readonly MessagePort[] }).ports[0];
    host.attachPort(wrapPort(port));
  };
} else {
  const port: PortLike = {
    postMessage: (message, transfer) => {
      if (transfer && transfer.length > 0) {
        (self as DedicatedWorkerGlobalScope).postMessage(message, transfer);
      } else {
        (self as DedicatedWorkerGlobalScope).postMessage(message);
      }
    },
    addEventListener: (type, listener) => {
      self.addEventListener(type, listener as EventListener);
    },
    removeEventListener: (type, listener) => {
      self.removeEventListener(type, listener as EventListener);
    },
  };
  host.attachPort(port);
}

function wrapPort(port: MessagePort): PortLike {
  return {
    postMessage: (message, transfer) => {
      if (transfer && transfer.length > 0) {
        port.postMessage(message, transfer);
      } else {
        port.postMessage(message);
      }
    },
    addEventListener: (type, listener) => port.addEventListener(type, listener),
    removeEventListener: (type, listener) => port.removeEventListener(type, listener),
    start: () => port.start(),
  };
}

function ensureBoolean(value: unknown, context: string): boolean {
  if (typeof value === 'boolean') return value;
  throw new Error(`Invalid ${context} response`);
}

function ensureString(value: unknown, context: string): string {
  if (typeof value === 'string') return value;
  throw new Error(`Invalid ${context} response`);
}

function ensureUint8Array(value: unknown, context: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  throw new Error(`Invalid ${context} response`);
}

function parseUnlockResponse(value: unknown): UnlockResponse {
  if (!isRecord(value)) throw new Error('Invalid unlock response');
  return {
    sessionId: asSessionId(requireString(value.sessionId, 'sessionId')),
    issuedAtMs: requireNumber(value.issuedAtMs, 'issuedAtMs'),
    expiresAtMs: requireNumber(value.expiresAtMs, 'expiresAtMs'),
    kind: requireSessionKind(value.kind, 'kind'),
    assurance: requireSessionAssurance(value.assurance, 'assurance'),
  };
}

function parseStepUpResponse(value: unknown): StepUpResponse {
  if (!isRecord(value)) throw new Error('Invalid stepUp response');
  return {
    issuedAtMs: requireNumber(value.issuedAtMs, 'issuedAtMs'),
    expiresAtMs: requireNumber(value.expiresAtMs, 'expiresAtMs'),
    kind: 'stepUp' as const,
    assurance: 'passphrase' as const,
  };
}

function parseRenewResponse(value: unknown): RenewSessionResponse {
  if (!isRecord(value)) throw new Error('Invalid renewSession response');
  return {
    issuedAtMs: requireNumber(value.issuedAtMs, 'issuedAtMs'),
    expiresAtMs: requireNumber(value.expiresAtMs, 'expiresAtMs'),
  };
}

function parseUserPresenceInfo(value: unknown): GetUserPresenceUnlockInfoResponse {
  if (!isRecord(value)) throw new Error('Invalid user presence response');
  const credentialId = value.credentialId;
  return {
    enabled: requireBoolean(value.enabled, 'enabled'),
    credentialId:
      credentialId === null || credentialId === undefined ? null : ensureUint8Array(credentialId, 'credentialId'),
    prfSalt: ensureUint8Array(value.prfSalt, 'prfSalt'),
    aead: requireAeadId(value.aead, 'aead'),
  };
}

function parseIngestScopeStateResponse(value: unknown): IngestScopeStateResponse {
  if (!isRecord(value)) throw new Error('Invalid ingestScopeState response');
  return {
    scopeId: asScopeId(requireString(value.scopeId, 'scopeId')),
    scopeStateRef: requireString(value.scopeStateRef, 'scopeStateRef'),
  };
}

function parseIngestKeyEnvelopeResponse(value: unknown): IngestKeyEnvelopeResponse {
  if (!isRecord(value)) throw new Error('Invalid ingestKeyEnvelope response');
  return {
    scopeId: asScopeId(requireString(value.scopeId, 'scopeId')),
    scopeEpoch: asScopeEpoch(requireBigint(value.scopeEpoch, 'scopeEpoch')),
  };
}

function parseSignResponse(value: unknown): SignResponse {
  if (!isRecord(value)) throw new Error('Invalid sign response');
  return {
    signature: ensureUint8Array(value.signature, 'signature'),
    ciphersuite: requireSigSuite(value.ciphersuite, 'ciphersuite'),
  };
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${field}`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new Error(`Invalid ${field}`);
  return value;
}

function requireBigint(value: unknown, field: string): bigint {
  if (typeof value !== 'bigint') throw new Error(`Invalid ${field}`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`);
  return value;
}

function requireSessionKind(value: unknown, field: string): 'normal' | 'stepUp' {
  if (value === 'normal' || value === 'stepUp') return value;
  throw new Error(`Invalid ${field}`);
}

function requireSessionAssurance(value: unknown, field: string): 'passphrase' | 'userPresence' {
  if (value === 'passphrase') return value;
  if (value === 'webauthnPrf' || value === 'userPresence') return 'userPresence';
  throw new Error(`Invalid ${field}`);
}

function requireAeadId(value: unknown, field: string): 'aead-1' {
  if (value === 'aead-1') return value;
  throw new Error(`Invalid ${field}`);
}

function requireSigSuite(value: unknown, field: string): 'hybrid-sig-1' {
  if (value === 'hybrid-sig-1') return value;
  throw new Error(`Invalid ${field}`);
}

function asSessionId(value: string): SessionId {
  if (value.length === 0) throw new Error('Invalid sessionId');
  return value as SessionId;
}

function asScopeId(value: string): ScopeId {
  if (value.length === 0) throw new Error('Invalid scopeId');
  return value as ScopeId;
}

function asScopeEpoch(value: bigint): ScopeEpoch {
  if (value < 0n) throw new Error('Invalid scopeEpoch');
  return value as ScopeEpoch;
}

function asKeyHandle(value: string): KeyHandle {
  if (value.length === 0) throw new Error('Invalid key handle');
  return value as KeyHandle;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
