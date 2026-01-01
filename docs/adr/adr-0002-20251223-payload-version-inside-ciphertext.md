# ADR ALC-301-02 — Payload version lives inside ciphertext

**Status**: Accepted
**Linear**: ALC-301
**Created**: 2025-12-23
**Last Updated**: 2026-01-01

- **Context**: Materialized event tables do not have a plaintext payload-version column.
- **Decision**: Encrypt an envelope `{ payloadVersion, data }` rather than adding a plaintext `payload_version` column.
- **Rationale**: Keep version from becoming plaintext metadata and reduce schema churn.
- **Consequences**: Decode order is fixed (decrypt → decode envelope → upcast → hydrate).
