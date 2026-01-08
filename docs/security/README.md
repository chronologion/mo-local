# Security Docs

This folder contains security- and privacy-focused documentation, threat models, and operational guidance.

## When to update these docs

Update `docs/security/` when a change affects any of:

- Cryptography (keys, envelopes, AAD, key rotation, backups)
- Sync protocol (what is sent in plaintext vs ciphertext, metadata exposure)
- Storage boundaries (OPFS/SQLite, IndexedDB, server persistence)
- Authentication/identity (Kratos integration, session handling)

## Structure

- `TEMPLATE.md` — starting point for new security notes
- `controls-matrix.md` — cross-cutting map of client/server controls and evidence (as-is system)
