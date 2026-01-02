# ZK Encryption Boundary Checklist

**Status**: Living
**Linear**: ALC-344
**Created**: 2026-01-02
**Last Updated**: 2026-01-02

## Scope

This is an audit checklist for `INV-006 ZK encryption boundary`: the server must never receive or derive user keys, and must never decrypt user payloads/snapshots.

## Non-goals

- Proving end-to-end secrecy in a compromised client runtime (e.g. XSS while unlocked).
- Exhaustive privacy guarantees (traffic analysis / metadata minimization roadmap).

## Invariants

- `INV-006` — ZK encryption boundary
- `INV-004` — Sync record bytes are preserved (related: server treats records as opaque bytes)
- `INV-013` — Integrity binding via AES-GCM AAD (related: clients reject wrong-context ciphertext)

## Checklist

### API surface

- [ ] Sync API accepts and returns only opaque `record_json` (base64url) + sync metadata; it never accepts plaintext payloads/snapshots.
- [ ] Sync API never returns keys, passphrases, KEKs, or decrypted payload material in any endpoint.
- [ ] API request/response logging does not include `record_json` contents in a way that could become plaintext (it should remain opaque ciphertext bytes).

### Dependency / code boundary

- [ ] `apps/api` does not import client-side crypto/key-handling packages (e.g. `@mo/infrastructure`, `@mo/presentation`).
- [ ] No decryption primitives are present in the server runtime (no `WebCryptoService`/`NodeCryptoService` usage in `apps/api`).
- [ ] Server-side data model stores ciphertext as-is and does not attempt to parse/decode into domain plaintext.

### Storage + operations

- [ ] Server persistence is ciphertext-only (`record_json` is stored and returned without mutation).
- [ ] Backups intended for recovery (keys/DB) are client-side only; the server never stores user keys.
- [ ] Diagnostics bundles are secret-free (`INV-015`) and do not include decrypted payloads or key material.

## Code pointers

- `apps/api/src/sync/**` — sync endpoints and persistence
- `apps/api/__tests__/security/zk-boundary.test.ts` — automated guard for server-side imports

