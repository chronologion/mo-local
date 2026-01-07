# RFC-20260107-key-scopes-and-sharing

**Status**: Draft
**Linear**: ALC-266, ALC-268
**Related**: ALC-258, ALC-299, ALC-332
**Created**: 2026-01-07
**Last Updated**: 2026-01-07

## Scope

Define a scalable key hierarchy and sharing model that:

- supports **multi-user sharing** (invites) and **multi-device** access for recipients,
- avoids “key explosion” as we add BCs like **Documents**, **Memories**, and **Money**,
- keeps the server outside the decryption boundary (ZK encryption boundary),
- clarifies the relationship between **DDD aggregates** and **confidentiality scopes** (which keys protect what).

This RFC is the architectural foundation for refreshing the outdated invite PRDs in `ALC-266` / `ALC-268`.

## Non-goals

- Final UI/UX flows (copy link, preview page, etc.).
- Full metadata privacy (traffic pattern leakage, membership graph obfuscation) beyond baseline minimization.
- Immediate implementation of key rotation and “cryptographic revocation” for historical ciphertext.
- Group ratcheting / MLS / per-message forward secrecy (explicitly out of scope for now).

## Problem

### 1) Aggregate keys + sharing does not scale to future BCs

Today we encrypt events under “per-aggregate DEKs”. That works well for Goals/Projects, but future BCs like Documents/Memories/Money create tension:

- If we treat every item as its own aggregate + its own DEK, then sharing a collection implies sharing **thousands of DEKs**.
- Recipients must persist and (somehow) recover those keys across devices. This becomes operationally brittle and makes key backup/restores heavy.

### 2) Current cross-device key recovery is masterKey-bound, not identity-bound

Our current “multi-device for the same user” recovery mechanism relies on a key distribution artifact (`keyring_update`) that is decryptable only by the owner’s passphrase-derived masterKey (via `deriveKey(masterKey, ...)`).

That property is fundamentally incompatible with sharing:

- The recipient’s masterKey is different.
- Therefore recipients cannot rely on the event stream (`keyring_update`) to recover shared keys on a new device.
- The system is forced into “store shared DEKs locally and back them up”, creating the key explosion problem above.

### 3) Capability links vs identity sharing must be BC-dependent

The original invite concept is “capability links” (bearer tokens, no PII). That may be acceptable for low-risk BCs, but not for high-risk BCs like Money where “anyone with the link” is unacceptable.

We need an explicit policy model for which BCs permit bearer invites vs identity-bound invites.

## Proposed Solution

### A) Separate *consistency boundary* from *confidentiality boundary*

- **Aggregate** (DDD) remains the unit of consistency and event sourcing.
- **Key scope** becomes the unit of confidentiality and share/revoke semantics.

We introduce the concept of a **Key Scope**:

- a stable identifier (`scopeId`) and type (`scopeType`)
- a symmetric **Scope Key** (`K_scope`) that encrypts events/snapshots for all aggregates/items inside that scope
- optional derived/wrapped **Item Keys** (`K_item`) for sub-items that need independent rotation or storage constraints

Key scopes should be chosen to match “how users share”, not “how developers model aggregates”.

Suggested mapping (initial direction; to be confirmed per BC):

- Goals: key scope = goal (fine to be per-aggregate)
- Projects: key scope = project (or “workspace”), depending on sharing UX
- Documents: key scope = vault / workspace / folder (not per document)
- Memories: key scope = album / vault (not per memory)
- Money: key scope = ledger / account / vault (strictest policies)

### B) Use hierarchical keying to avoid key explosion

For high-volume BCs (Documents/Memories), we avoid storing one DEK per item in backups by using a scope key and deriving subkeys:

Two viable patterns:

1. **Derive per-item keys** from `K_scope`:
   - `K_item = HKDF(K_scope, context = "{scopeType}:{scopeId}:{itemType}:{itemId}")`
   - Pros: no per-item key storage, deterministic rebuild.
   - Cons: changing scope membership/rotation changes all derived keys.

2. **Wrap per-item random keys** under `K_scope`:
   - Generate `K_item` randomly; store `wrap(K_item, K_scope)` as item metadata (client-side only).
   - Pros: supports targeted per-item rotation without rekeying the whole scope.
   - Cons: adds per-item wrapped-key metadata (still manageable; ciphertext only).

**Decision (MVP)**: use wrapped random per-item keys for high-volume BCs. HKDF-derived keys make scope rotation catastrophic because every item must be re-encrypted under the new scope key. Wrapped keys allow scope rotation by re-wrapping metadata only.

### C) Make cross-device key recovery identity-bound (not masterKey-bound)

We evolve key distribution from “owner masterKey can open it” to “authorized identities can open it”.

Introduce **Key Distribution Record** per `(scopeId, epoch)`:

- contains `epoch`, `scopeId`, and a set of **recipient envelopes**
- each envelope is `wrap(K_scope_epoch, recipientPublicKey)` (ECDH-based as in `SharingCrypto`)
- owner is “just another recipient” (wrapped to the owner identity key)

This yields the key property we need:

- A recipient can restore on a new device with only **identity keys** + sync pull.
- No need to back up thousands of shared DEKs.

This design aligns with planned hardening in `ALC-299`: identity keys and decrypt operations can be forced through a worker boundary with session TTL and auto-lock.

### D) Invite types: identity-bound by default; bearer links only where acceptable

We define two invite types. BC policy determines which are allowed.

1. **Identity-bound invites (recommended default)**
   - Invite link is only an `inviteId`/token; recipient must authenticate.
   - Server stores an encrypted recipient envelope and returns it only to that recipient.
   - Pros: avoids “anyone with link” risk; supports auditability; supports revocation semantics.

2. **Bearer invites (capability links)**
   - Invite link contains a secret sufficient to decrypt an invite envelope.
   - Pros: frictionless sharing.
   - Cons: “possession = access”, hard to revoke, dangerous for Money-like BCs.

Policy direction:

- Goals/Projects: may allow bearer invites for MVP (explicitly opt-in), but identity-bound should still exist.
- Documents/Memories: likely identity-bound by default (sharing is long-lived).
- Money: bearer invites are forbidden; identity-bound only, and likely step-up required (`ALC-299`).

### E) Epochs and revocation semantics (MVP)

We need a clear, implementable revocation story:

- **Membership change** (remove a recipient) is handled by **epoch rotation**:
  - new epoch with new `K_scope`, distributed to remaining members
  - new events/snapshots use the new epoch
- We explicitly do **not** re-encrypt historical ciphertext in MVP.

This provides “future confidentiality” without requiring a full history rewrite.

### F) Key distribution record storage (MVP)

We need a place to store and retrieve per-recipient envelopes without leaking full membership data to all clients.

**Decision (MVP)**: server-filtered endpoint.

- Server stores envelopes per `scopeId` + `recipientId` + `epoch`.
- Clients fetch **only their own** envelope(s) after authentication.
- Event stream remains free of membership data; sync payloads do not reveal sharing graph.

Options considered:

| Option                   | Privacy                      | Complexity | Decision |
|--------------------------|------------------------------|------------|----------|
| Event stream             | Recipients see all envelopes | Low        | ❌ Leaks membership |
| Server-filtered endpoint | Only your envelope           | Medium     | ✅ MVP choice |
| Dedicated sync stream    | Filtered per-user            | High       | Later, if needed |

## Key Invariants

This RFC relies on existing invariants and proposes new ones to be registered if/when implemented.

Existing (already in `docs/invariants.md`):

1. `INV-006` — ZK encryption boundary (server cannot decrypt payloads)
2. `INV-014` — Keys are encrypted at rest under a KEK

To register (proposed):

1. `INV-0XX` — Key scope is the confidentiality boundary (not aggregate)
2. `INV-0XX` — Shared scope keys are recoverable cross-device via identity keys + sync (no key backups of per-item keys required)
3. `INV-0XX` — Revocation is epoch-based: removed recipients cannot decrypt new-epoch ciphertext

## Consequences / trade-offs

- Identity-bound distribution may reveal membership graph to the server unless we add additional privacy measures.
- Deriving per-item keys from `K_scope` makes scope rotation heavier (affects all derived items). Wrapping per-item keys is more flexible but adds metadata.
- Bearer invites are a UX win but a security hazard; they must be explicitly BC-gated.

## Migration / evolution plan (high-level)

1. Refresh `ALC-266` / `ALC-268` as an RFC-first spec referencing this RFC.
2. Introduce key scopes for existing BCs (start with Goals/Projects as “scope = aggregate”).
3. Evolve key distribution artifacts to be identity-bound and recoverable cross-device for recipients.
4. Add BC policies for invite type (bearer vs identity-bound) + step-up requirements (`ALC-299`).
5. Add a first high-volume BC using scope keys (Documents or Memories) to validate the model early.

## Server contract (MVP outline)

We will need Access BC endpoints for scope membership + envelope retrieval:

- `POST /scopes/{scopeId}/invites` — create invite; store recipient envelope or capability envelope
- `GET /scopes/{scopeId}/key` — return caller’s envelope for the **latest** eligible epoch
- `DELETE /scopes/{scopeId}/members/{id}` — revoke (triggers epoch rotation)

This is intentionally separate from `/sync` to keep event sync payloads membership-blind.

## Offline recipient handling

If a recipient is offline when invited, and the scope rotates before they come online:

- the server must retain **all epochs** the recipient has not yet acknowledged;
- on fetch, the server can return a small backlog (`[epochN, epochN+1, ...]`) so the client can decrypt forward.

We should define a bounded retention policy and acknowledgement mechanism (e.g., client reports “I have epoch X”).

## Epoch semantics in SyncRecord

`epoch` in `record_json` should represent the **scope key epoch** used to encrypt the payload.
The sync engine does not need to know “aggregate vs scope” — it only needs the epoch to select the correct key.

## Open Questions

- [ ] For Documents/Memories, do we want “share at vault/folder/album level” as the primary UX (vs per-item sharing)?
- [ ] For Money, are bearer invites categorically forbidden? If yes, what is the minimum acceptable “invite friction”?
- [ ] What plaintext metadata (if any) can the server see about membership and permissions? Is membership graph leakage acceptable for MVP?
- [ ] What are the long-term rotation requirements (re-encrypt history vs “future-only”)? Which BCs require which?
