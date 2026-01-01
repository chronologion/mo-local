# ADR ALC-301-03 — Registry-driven serialization (no per-BC codecs)

**Status**: Accepted
**Linear**: ALC-301
**Created**: 2025-12-23
**Last Updated**: 2026-01-01

- **Context**: BC-specific codecs were large, duplicated, and inconsistent.
- **Decision**: Use a single registry/runtime driven by per-event specs.
- **Rationale**: Single source of truth for encode/decode; easier testing; fewer switches.
- **Consequences**: Specs must be explicitly registered (`specs.generated.ts`) until codegen exists.
