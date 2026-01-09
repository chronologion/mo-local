# mo-key-service-core

## Overview

`mo-key-service-core` is the Rust core for the Key Service. It defines the canonical CBOR formats and AAD registry, KeyVault formats and integrity checks, the ciphersuite registry, and the session policy engine described in `docs/rfcs/rfc-20260107-key-service-core.md`.

This crate is consumed by the WASM wrapper (`mo-key-service-wasm`) and is not a standalone binary.

## Documentation

- `docs/architecture.md` — system overview and layering.
- `docs/rfcs/rfc-20260107-key-service-core.md` — Key Service contracts, formats, and policy rules.
- `docs/rfcs/rfc-20260107-key-scopes-and-sharing.md` — scope/grant flows that depend on this core.
- `docs/invariants.md` — invariant registry and test traceability.
- `docs/security/key-management.md` and `docs/security/sync-boundary.md` — security model details.

## Structure (selected modules)

- `src/cbor.rs` — canonical CBOR encoding/decoding helpers and limits.
- `src/formats.rs` — wire formats (KeyVault, scope/grant containers, envelopes).
- `src/ciphersuite.rs` — crypto primitives and hybrid KEM/signing wrappers.
- `src/keyvault.rs` — KeyVault state transitions and integrity checks.
- `src/key_service.rs` — session policy and service orchestration.
- `src/async_key_service.rs` — async storage facade for native/desktop adapters.

## Testing and quality

From the repo root:

- `cargo test -p mo-key-service-core`
- `cargo clippy -p mo-key-service-core --all-targets --all-features -- -D warnings`
- `cargo fmt --all --check`

From `packages/key-service-core/`:

- `cargo test`

## Notes

- Public APIs and wire formats are intentionally strict (canonical CBOR + explicit AAD bindings).
- Zeroization is best-effort (especially under WASM). Treat long-lived secrets as sensitive even after drop.
