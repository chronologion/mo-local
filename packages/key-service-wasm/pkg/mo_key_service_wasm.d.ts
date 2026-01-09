/* tslint:disable */
/* eslint-disable */

export class KeyServiceWasm {
  free(): void;
  [Symbol.dispose](): void;
  open_scope(session_id: string, scope_id: string, scope_epoch: bigint): string;
  close_handle(session_id: string, key_handle: string): void;
  create_vault(user_id: string, passphrase_utf8: Uint8Array, kdf_params: any): void;
  load_storage(entries: any): void;
  open_resource(session_id: string, scope_key_handle: string, grant_cbor: Uint8Array): string;
  renew_session(session_id: string): any;
  export_keyvault(session_id: string): Uint8Array;
  import_keyvault(session_id: string, blob: Uint8Array): void;
  change_passphrase(session_id: string, new_passphrase_utf8: Uint8Array): void;
  unlock_passphrase(passphrase_utf8: Uint8Array): any;
  ingest_scope_state(session_id: string, scope_state_cbor: Uint8Array, expected_owner_signer_fingerprint: any): any;
  ingest_key_envelope(session_id: string, key_envelope_cbor: Uint8Array): any;
  unlock_webauthn_prf(prf_output: Uint8Array): any;
  drain_storage_writes(): any;
  enable_webauthn_prf_unlock(session_id: string, credential_id: Uint8Array, prf_output: Uint8Array): void;
  disable_webauthn_prf_unlock(session_id: string): void;
  get_webauthn_prf_unlock_info(): any;
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
  step_up(session_id: string, passphrase_utf8: Uint8Array): any;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_keyservicewasm_free: (a: number, b: number) => void;
  readonly keyservicewasm_change_passphrase: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number];
  readonly keyservicewasm_close_handle: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly keyservicewasm_create_vault: (
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
  readonly keyservicewasm_disable_webauthn_prf_unlock: (a: number, b: number, c: number) => [number, number];
  readonly keyservicewasm_drain_storage_writes: (a: number) => any;
  readonly keyservicewasm_enable_webauthn_prf_unlock: (
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
  readonly keyservicewasm_export_keyvault: (a: number, b: number, c: number) => [number, number, number, number];
  readonly keyservicewasm_get_webauthn_prf_unlock_info: (a: number) => [number, number, number];
  readonly keyservicewasm_import_keyvault: (a: number, b: number, c: number, d: number, e: number) => [number, number];
  readonly keyservicewasm_ingest_key_envelope: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number];
  readonly keyservicewasm_ingest_scope_state: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: any
  ) => [number, number, number];
  readonly keyservicewasm_load_storage: (a: number, b: any) => [number, number];
  readonly keyservicewasm_lock: (a: number, b: number, c: number) => [number, number];
  readonly keyservicewasm_new: () => number;
  readonly keyservicewasm_open_resource: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number
  ) => [number, number, number, number];
  readonly keyservicewasm_open_scope: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: bigint
  ) => [number, number, number, number];
  readonly keyservicewasm_renew_session: (a: number, b: number, c: number) => [number, number, number];
  readonly keyservicewasm_sign: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly keyservicewasm_step_up: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly keyservicewasm_unlock_passphrase: (a: number, b: number, c: number) => [number, number, number];
  readonly keyservicewasm_unlock_webauthn_prf: (a: number, b: number, c: number) => [number, number, number];
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
