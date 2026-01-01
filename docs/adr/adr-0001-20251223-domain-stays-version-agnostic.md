# ADR ALC-301-01 — Domain stays version-agnostic

**Status**: Accepted
**Linear**: ALC-301
**Created**: 2025-12-23
**Last Updated**: 2026-01-01

- **Context**: Versioning/upcasting was scattered across domain/codecs, creating duplication and unclear ownership.
- **Decision**: Domain exports only “latest mapping specs”; all payload versions and upcasters live in infrastructure.
- **Rationale**: Preserve a clean domain model; keep persistence concerns at the boundary.
- **Consequences**: Infrastructure owns migrations forever; tests must cover registry/runtime correctness.
