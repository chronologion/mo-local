/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_keyservicewasm_free: (a: number, b: number) => void;
export const keyservicewasm_changePassphrase: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number
) => [number, number];
export const keyservicewasm_closeHandle: (a: number, b: number, c: number, d: number, e: number) => [number, number];
export const keyservicewasm_createVault: (
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
export const keyservicewasm_disableWebauthnPrfUnlock: (a: number, b: number, c: number) => [number, number];
export const keyservicewasm_drainStorageWrites: (a: number) => any;
export const keyservicewasm_enableWebauthnPrfUnlock: (
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
export const keyservicewasm_exportKeyVault: (a: number, b: number, c: number) => [number, number, number, number];
export const keyservicewasm_getWebauthnPrfUnlockInfo: (a: number) => [number, number, number];
export const keyservicewasm_importKeyVault: (a: number, b: number, c: number, d: number, e: number) => [number, number];
export const keyservicewasm_ingestKeyEnvelope: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number
) => [number, number, number];
export const keyservicewasm_ingestScopeState: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: any
) => [number, number, number];
export const keyservicewasm_loadStorage: (a: number, b: any) => [number, number];
export const keyservicewasm_lock: (a: number, b: number, c: number) => [number, number];
export const keyservicewasm_new: () => number;
export const keyservicewasm_openResource: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number
) => [number, number, number, number];
export const keyservicewasm_openScope: (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: bigint
) => [number, number, number, number];
export const keyservicewasm_renewSession: (a: number, b: number, c: number) => [number, number, number];
export const keyservicewasm_sign: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
export const keyservicewasm_stepUp: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
export const keyservicewasm_unlockPassphrase: (a: number, b: number, c: number) => [number, number, number];
export const keyservicewasm_unlockWebauthnPrf: (a: number, b: number, c: number) => [number, number, number];
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
