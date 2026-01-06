# RFC-20260106-serialized-event-envelope

**Status**: Draft
**Linear**: ALC-332
**Related**: ALC-302, ALC-305, ALC-269
**Created**: 2026-01-06
**Last Updated**: 2026-01-06

## Scope

Define the canonical, versioned event serialization envelopes across:

- local persistence (OPFS SQLite `events` table),
- sync transport (`SyncPushRequestV1`, `SyncPullResponseV1`), and
- server persistence (`record_json`).

The RFC explicitly defines the plaintext vs ciphertext split, integrity binding rules, and byte canonicalization requirements.

## Non-goals

- Implementing the migration (tracked in follow-ups once the RFC is accepted).
- Solving timing/size/access-pattern leakage (out of scope for the POC).
- Introducing new crypto primitives beyond the existing AES-GCM boundary.

## Problem

The current sync record is a near-mirror of the local OPFS row shape. As a result, the server sees plaintext metadata that it does not need for sync mechanics (notably `eventType` and `occurredAt`). This conflicts with our security posture (`ALC-269`) and the explicit requirement to keep event descriptors and client timestamps out of server-visible metadata.

Additionally, the encryption integrity binding (AAD) is currently tied to `{aggregateId, eventType, version}`. This hard-codes a dependence on plaintext `eventType`, making it difficult to remove `eventType` from the sync record without rethinking the envelope and AAD scheme.

We need a canonical envelope spec that:

- decouples local row shape from sync/server shape,
- minimizes plaintext metadata leakage to the server,
- preserves byte stability for synced records (`INV-004`), and
- supports forward evolution (versioned envelopes + migration plan).

## Proposed Solution

### 1) Define envelope layers (local, encrypted payload, sync record)

We explicitly separate three layers:

1. **Local event row (OPFS SQLite)**
   - Optimized for local querying, projections, and rebase.
   - Contains plaintext columns that are required locally (e.g., `event_type`, `occurred_at`).
   - This local row is not a sync contract.

2. **Encrypted event payload envelope**
   - The ciphertext stored in `payload_encrypted` is the encryption of a versioned envelope.
   - This envelope now carries event metadata that should not be visible to the server.

3. **Sync record envelope (record_json)**
   - Canonical, versioned sync record for server storage and transport.
   - Contains only the minimal plaintext fields required for sync mechanics.

### 2) Encrypted payload envelope v2

We introduce a new encrypted payload envelope version (`eventEnvelopeVersion = 2`) that includes metadata we intend to keep off the server:

```
EventEnvelopeV2 = {
  eventEnvelopeVersion: 2,
  header: {
    eventType: string,
    occurredAt: number,
    actorId: string | null,
    causationId: string | null,
    correlationId: string | null,
    epoch: number | null
  },
  payload: {
    payloadVersion: number,
    data: JsonValue
  }
}
```

Notes:

- `eventType` and `occurredAt` move into ciphertext.
- `actorId` and tracing fields (`causationId`, `correlationId`) also move into ciphertext unless required for sync mechanics.
- `payloadVersion` and `data` remain the domain payload envelope (no change in the domain event spec layer).

### 3) Sync record envelope v2 (record_json)

We define a new `record_json` schema that is explicitly decoupled from the local row shape:

```
SyncRecordV2 = {
  recordVersion: 2,
  aggregateType: string,
  aggregateId: string,
  version: number,
  payloadCiphertext: string,   // base64url
  keyringUpdate: string | null, // base64url
  aadVersion: 2
}
```

Key points:

- `eventType` and `occurredAt` are not present in plaintext.
- `eventId` is still transmitted separately in sync requests/responses and stored in the server row (for idempotency). It does not need to be duplicated in `record_json`.
- `aggregateType`, `aggregateId`, and `version` remain plaintext because they are required to compute AAD for decryption (see below).

### 4) AAD binding v2 (remove eventType)

We introduce a new AAD scheme to remove the dependency on plaintext `eventType`:

```
AADv2 = "{aggregateType}:{aggregateId}:{version}"
```

Rationale:

- `aggregateId` + `version` are already required for local OCC and event ordering.
- Including `aggregateType` provides additional context separation at minimal cost.
- `eventType` is no longer required for AAD; its integrity is guaranteed by AES-GCM over ciphertext (it lives inside the encrypted envelope).

AAD versioning is explicit (`aadVersion` in the sync record) so clients can decrypt both legacy and new records.

### 5) Canonicalization rules (bytes that matter)

For the current JS boundary, we keep the deterministic JSON stringify rule:

- `record_json` is serialized by `JSON.stringify` with stable property order and no whitespace.
- Byte-preservation remains an explicit invariant (`INV-004`).

This RFC does not introduce cross-language canonicalization, but requires that `recordVersion` and field order remain stable. Aligns with future work in `ALC-302` (JCS RFC-8785).

## Migration & Back-compat Plan (high level)

1. **Readers first**:
   - Sync engine must accept both record versions (`recordVersion` optional implies v1).
   - Decryption must support both AADv1 and AADv2.

2. **Writer switch**:
   - New events should be written with `recordVersion = 2` once all active clients can read it.

3. **Local materialization changes**:
   - Applying remote events now requires decrypting the payload envelope to extract `eventType` and `occurredAt` (for local OPFS columns).
   - This implies a new ingestion step in sync that has access to aggregate keys (or a new infra service that performs the decrypt + local insert).

4. **Pending rewrite**:
   - Pending version rewrite logic must respect the AAD version. Existing AADv1 events are rewritten with AADv1; new AADv2 events with AADv2.

## Security impact

- Removes server visibility of `eventType` and client timestamps (`occurredAt`).
- Preserves required sync metadata and byte stability (`INV-004`).
- AADv2 eliminates a plaintext dependency on `eventType` while maintaining integrity binding to aggregate context and version (`INV-013` with an updated scheme).

## Key invariants

1. `INV-004` — Sync record bytes are preserved (server stores `record_json` as TEXT without canonicalization changes).
2. `INV-013` — AES-GCM AAD binds ciphertext to aggregate context and version (AADv2).
3. New invariant (to register): Sync records do not expose `eventType` or `occurredAt` in plaintext across the sync boundary.

## Open Questions

- [ ] Do we keep `actorId` in plaintext locally only, or also move it inside the encrypted envelope? (Sync boundary should omit it.)
- [ ] Do we need a dedicated `eventEnvelopeVersion` vs reusing `payloadVersion`? (The former allows metadata-only evolution.)
- [ ] Should `aggregateType` be included in AADv2, or is `aggregateId` + `version` sufficient?
- [ ] Should `record_json` include a compact `aadVersion` field or encode it in `recordVersion`?
- [ ] What is the cleanest API boundary for “decrypt + materialize local row” in the sync engine?
