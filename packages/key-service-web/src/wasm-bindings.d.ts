declare module '@mo/key-service-wasm' {
  type WasmInitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

  export default function init(moduleOrPath?: WasmInitInput): Promise<void>;

  export class KeyServiceWasm {
    constructor();
    loadStorage(entries: unknown): void;
    drainStorageWrites(): unknown;
    createVault(userId: string, passphraseUtf8: Uint8Array, kdfParams: unknown): void;
    unlockPassphrase(passphraseUtf8: Uint8Array): unknown;
    unlockUserPresence(userPresenceSecret: Uint8Array): unknown;
    stepUp(sessionId: string, passphraseUtf8: Uint8Array): unknown;
    getUserPresenceUnlockInfo(): unknown;
    renewSession(sessionId: string): unknown;
    lock(sessionId: string): void;
    exportKeyVault(sessionId: string): unknown;
    importKeyVault(sessionId: string, blob: Uint8Array): void;
    changePassphrase(sessionId: string, newPassphraseUtf8: Uint8Array): void;
    storeAppMasterKey(sessionId: string, masterKey: Uint8Array): void;
    getAppMasterKey(sessionId: string): unknown;
    enableUserPresenceUnlock(sessionId: string, credentialId: Uint8Array, userPresenceSecret: Uint8Array): void;
    disableUserPresenceUnlock(sessionId: string): void;
    ingestScopeState(
      sessionId: string,
      scopeStateCbor: Uint8Array,
      expectedOwnerSignerFingerprint: string | null
    ): unknown;
    ingestKeyEnvelope(sessionId: string, keyEnvelopeCbor: Uint8Array): unknown;
    openScope(sessionId: string, scopeId: string, scopeEpoch: bigint): unknown;
    openResource(sessionId: string, scopeKeyHandle: string, grantCbor: Uint8Array): unknown;
    closeHandle(sessionId: string, keyHandle: string): void;
    encrypt(sessionId: string, resourceKeyHandle: string, aad: Uint8Array, plaintext: Uint8Array): unknown;
    decrypt(sessionId: string, resourceKeyHandle: string, aad: Uint8Array, ciphertext: Uint8Array): unknown;
    sign(sessionId: string, data: Uint8Array): unknown;
    verify(
      scopeId: string,
      signerDeviceId: string,
      data: Uint8Array,
      signature: Uint8Array,
      ciphersuite: string
    ): unknown;
  }
}
