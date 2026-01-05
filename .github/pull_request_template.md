## Docs impact

- [ ] No doc updates needed
- [ ] Updated `docs/architecture.md` (overview) if architecture boundaries/invariants changed
- [ ] Updated a topic doc under `docs/architecture/` (preferred for detailed changes)
- [ ] Added/updated an ADR under `docs/adr/` (decision recorded with `Linear` reference)
- [ ] Added/updated an RFC under `docs/rfcs/` (proposal recorded with `Linear` reference)

## Invariants

- [ ] This change preserves existing invariants (or updates `docs/invariants.md` + tests)
- [ ] Logging/diagnostics reviewed for plaintext leakage (`INV-019`, `INV-015`)

## Quality gates

- [ ] Linked the Linear issue(s) in the PR description (e.g. `ALC-XXX`)
- [ ] Lint + typecheck pass (`yarn lint`, `yarn typecheck`)
- [ ] Unit/integration tests cover key paths; coverage >80% where measured (`yarn test:coverage`) and tests typechecked (`yarn typecheck:test`)
- [ ] E2E tests added/updated only when relevant; critical flows covered (`yarn e2e`)
- [ ] Formatting is clean (`yarn format:check`)
- [ ] If DB/schema changed: migrations + local stack verified (`yarn db:migrate`, `yarn dev:stack`)
- [ ] If touching crypto/sync/storage/auth: security/privacy impact assessed and documented (add/update `docs/security/`)
