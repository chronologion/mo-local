# ADR ALC-301-05 — Sync records are byte-preserved via TEXT JSON + base64url bytes

**Status**: Accepted
**Linear**: ALC-301
**Created**: 2025-12-23
**Last Updated**: 2026-01-01

- **Context**: We require payload byte stability across push → server persistence → pull. JSON stores may re-encode or reorder content; byte arrays must not be represented as numeric-key objects.
- **Decision**: Push `recordJson` (TEXT) with ciphertext bytes encoded as base64url strings, store it as TEXT on the server (`record_json`), and return it without re-stringifying.
- **Rationale**: Make the “byte-preservation” boundary explicit and testable while we are still JS-only at the edges.
- **Consequences**: Future non-JS boundaries require an explicit canonical encoding decision (e.g. canonical JSON or CBOR).
