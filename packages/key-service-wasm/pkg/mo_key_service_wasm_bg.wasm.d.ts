/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_keyservicewasm_free: (a: number, b: number) => void;
export const keyservicewasm_change_passphrase: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number
) => [number, number];
export const keyservicewasm_close_handle: (a: number, b: number, c: number, d: number, e: number) => [number, number];
export const keyservicewasm_create_vault: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: any
) => [number, number];
export const keyservicewasm_decrypt: (
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
export const keyservicewasm_disable_webauthn_prf_unlock: (a: number, b: number, c: number) => [number, number];
export const keyservicewasm_drain_storage_writes: (a: number) => any;
export const keyservicewasm_enable_webauthn_prf_unlock: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number
) => [number, number];
export const keyservicewasm_encrypt: (
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
export const keyservicewasm_export_keyvault: (a: number, b: number, c: number) => [number, number, number, number];
export const keyservicewasm_get_webauthn_prf_unlock_info: (a: number) => [number, number, number];
export const keyservicewasm_import_keyvault: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number
) => [number, number];
export const keyservicewasm_ingest_key_envelope: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number
) => [number, number, number];
export const keyservicewasm_ingest_scope_state: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: any
) => [number, number, number];
export const keyservicewasm_load_storage: (a: number, b: any) => [number, number];
export const keyservicewasm_lock: (a: number, b: number, c: number) => [number, number];
export const keyservicewasm_new: () => number;
export const keyservicewasm_open_resource: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number
) => [number, number, number, number];
export const keyservicewasm_open_scope: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: bigint
) => [number, number, number, number];
export const keyservicewasm_renew_session: (a: number, b: number, c: number) => [number, number, number];
export const keyservicewasm_sign: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
export const keyservicewasm_step_up: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number
) => [number, number, number];
export const keyservicewasm_unlock_passphrase: (a: number, b: number, c: number) => [number, number, number];
export const keyservicewasm_unlock_webauthn_prf: (a: number, b: number, c: number) => [number, number, number];
export const keyservicewasm_verify: (
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
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_start: () => void;
