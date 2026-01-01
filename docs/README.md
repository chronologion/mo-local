# Documentation Strategy

This repo treats documentation as part of the architecture. Docs are organized by responsibility (cohesion, coupling, single responsibility) so they remain maintainable as the codebase grows.

## Structure

- `docs/architecture.md` — architecture overview (the map)
- `docs/invariants.md` — invariant registry (traceability to tests)
- `docs/architecture/` — architecture topic docs (the territory)
- `docs/runbooks/` — operational playbooks (procedures/checklists)
- `docs/adr/` — architecture decision records (ADRs)
- `docs/rfcs/` — proposals/design notes (RFCs)
- `docs/security/` — security model and threat-driven docs

## How to decide where something belongs

- Put **stable, cross-cutting summaries** in an overview (`docs/architecture.md`).
- Put **detailed, long-lived contracts** in a topic doc (`docs/architecture/*.md`).
- Put **procedures / checklists** in a runbook (`docs/runbooks/*.md`).
- Put **a decision** (what/why/consequences, short and stable) in an ADR (`docs/adr/`).
- Put **a proposal** (options/tradeoffs, still changing) in an RFC (`docs/rfcs/`).
- Put **security/threat model** content in `docs/security/` (not sprinkled across architecture docs).

## Process (how docs change)

### When to update docs

Update docs in the same PR whenever you change any of:

- Layer boundaries (new dependencies, ports, adapters, composition roots)
- Event store/sync protocol/ordering contracts
- Derived state / projections / sagas behavior (rebuild, invalidation, rebase)
- Crypto, key management, backups, or storage boundaries (OPFS/IndexedDB)
- Auth/identity behavior or privacy assumptions

### What to update

- If you changed a cross-cutting concept: update `docs/architecture.md` (keep it small).
- If you changed a detailed contract: update or add a topic doc under `docs/architecture/` (preferred).
- If you changed security properties/threat model: update `docs/security.md` and/or a topic in `docs/security/`.
- If you introduced/changed an invariant: update `docs/invariants.md` and add/adjust tests.
- If you made a durable decision: add an ADR under `docs/adr/`.
- If you’re proposing a design still in flux: add an RFC under `docs/rfcs/`.

### Templates and metadata (required)

- New topic docs: start from `docs/architecture/TEMPLATE.md` or `docs/security/TEMPLATE.md`.
- New ADRs/RFCs: start from `docs/adr/TEMPLATE.md` or `docs/rfcs/TEMPLATE.md`.
- Every ADR/RFC/topic doc must include:
  - `Linear: ALC-XXX` reference(s)
  - `Created` and `Last Updated` dates

### Review expectations

- Prefer “reference docs” over “narrative”: make contracts explicit, add code pointers, and keep scope tight.
- Avoid duplication: a single source of truth per concept; link instead of repeating.
- “Open Questions” live in the relevant topic doc and should link to (or become) Linear issues.

## “Docs are architecture”

If a document grows too large or mixes multiple responsibilities, split it by concern. “God docs” go stale for the same reason “god classes” do: the coupling becomes too high to safely change.
