/* tslint:disable */
/* eslint-disable */

export class KeyServiceWasm {
  free(): void;
  [Symbol.dispose](): void;
  openScope(session_id: string, scope_id: string, scope_epoch: bigint): string;
  closeHandle(session_id: string, key_handle: string): void;
  createVault(user_id: string, passphrase_utf8: Uint8Array, kdf_params: any): void;
  loadStorage(entries: any): void;
  openResource(session_id: string, scope_key_handle: string, grant_cbor: Uint8Array): string;
  renewSession(session_id: string): any;
  exportKeyVault(session_id: string): Uint8Array;
  importKeyVault(session_id: string, blob: Uint8Array): void;
  changePassphrase(session_id: string, new_passphrase_utf8: Uint8Array): void;
  unlockPassphrase(passphrase_utf8: Uint8Array): any;
  ingestScopeState(session_id: string, scope_state_cbor: Uint8Array, expected_owner_signer_fingerprint: any): any;
  ingestKeyEnvelope(session_id: string, key_envelope_cbor: Uint8Array): any;
  unlockWebauthnPrf(prf_output: Uint8Array): any;
  drainStorageWrites(): any;
  enableWebauthnPrfUnlock(session_id: string, credential_id: Uint8Array, prf_output: Uint8Array): void;
  disableWebauthnPrfUnlock(session_id: string): void;
  getWebauthnPrfUnlockInfo(): any;
  constructor();
  lock(session_id: string): void;
  sign(session_id: string, data: Uint8Array): any;
  verify(
    scope_id: string,
    signer_device_id: string,
    data: Uint8Array,
    signature: Uint8Array,
    ciphersuite: string
  ): boolean;
  decrypt(session_id: string, resource_key_handle: string, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array;
  encrypt(session_id: string, resource_key_handle: string, aad: Uint8Array, plaintext: Uint8Array): Uint8Array;
  stepUp(session_id: string, passphrase_utf8: Uint8Array): any;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_keyservicewasm_free: (a: number, b: number) => void;
  readonly keyservicewasm_changePassphrase: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly keyservicewasm_closeHandle: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly keyservicewasm_createVault: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: any
  ) => [number, number];
  readonly keyservicewasm_decrypt: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number
  ) => [number, number, number, number];
  readonly keyservicewasm_disableWebauthnPrfUnlock: (a: number, b: number, c: number) => [number, number];
  readonly keyservicewasm_drainStorageWrites: (a: number) => any;
  readonly keyservicewasm_enableWebauthnPrfUnlock: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number
  ) => [number, number];
  readonly keyservicewasm_encrypt: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number
  ) => [number, number, number, number];
  readonly keyservicewasm_exportKeyVault: (a: number, b: number, c: number) => [number, number, number, number];
  readonly keyservicewasm_getWebauthnPrfUnlockInfo: (a: number) => [number, number, number];
  readonly keyservicewasm_importKeyVault: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly keyservicewasm_ingestKeyEnvelope: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number];
  readonly keyservicewasm_ingestScopeState: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: any
  ) => [number, number, number];
  readonly keyservicewasm_loadStorage: (a: number, b: any) => [number, number];
  readonly keyservicewasm_lock: (a: number, b: number, c: number) => [number, number];
  readonly keyservicewasm_new: () => number;
  readonly keyservicewasm_openResource: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number
  ) => [number, number, number, number];
  readonly keyservicewasm_openScope: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: bigint
  ) => [number, number, number, number];
  readonly keyservicewasm_renewSession: (a: number, b: number, c: number) => [number, number, number];
  readonly keyservicewasm_sign: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly keyservicewasm_stepUp: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly keyservicewasm_unlockPassphrase: (a: number, b: number, c: number) => [number, number, number];
  readonly keyservicewasm_unlockWebauthnPrf: (a: number, b: number, c: number) => [number, number, number];
  readonly keyservicewasm_verify: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number
  ) => [number, number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>
): Promise<InitOutput>;
