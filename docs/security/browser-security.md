# Browser Security

**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Scope

Client runtime security assumptions and required hardening for a local-first encrypted app running in the browser.

## Non-goals

- Defending against a compromised browser/OS.
- Preventing all data exfiltration if arbitrary JS executes while unlocked.

## Invariants

Relevant invariants in `docs/invariants.md`:

- `INV-016` — Secure context required
- `INV-015` — Diagnostics are secret-free

## Details

### Primary risk: XSS

For an encryption-centric web app, XSS is equivalent to “attacker in the user’s process”. Mitigations must be treated as first-class requirements:

- Strong CSP (and eventually Trusted Types) to prevent script injection.
- Strict input handling (no `dangerouslySetInnerHTML` except audited, sanitized uses).
- Dependency hygiene (audit and minimize third-party script execution).

### Secondary risks

- Malicious extensions: cannot be fully prevented; document this risk.
- Clickjacking: ensure appropriate frame protections in production.

## Code pointers

- `apps/web/src/**` — UI rendering surfaces (primary XSS boundary)

## Open questions

- [ ] Define CSP/Trusted Types policy and enforce it in build/deploy tooling.
