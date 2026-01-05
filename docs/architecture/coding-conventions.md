# Coding conventions

**Scope**: Repo-specific TypeScript and architecture conventions that protect the foundation (DDD/CQRS/ES/local-first).
**Non-goals**: Generic TypeScript style guidance.
**Status**: Living
**Linear**: ALC-334
**Created**: 2026-01-01
**Last Updated**: 2026-01-01

## Invariants

This doc does not define new invariants. It relies on the invariant registry in `docs/invariants.md`.

## Details

### Layering rules (hard)

- **Domain is dependency-free** (no imports from application/infrastructure/presentation).
- **Commands/queries are data only**; orchestration lives in handlers.
- **Ports are defined in the inner layers**, implemented in infrastructure, wired in composition roots (`apps/web`, `apps/api`).
- **No “reach-around”** from UI to infrastructure; UI calls application services/handlers.

See: `docs/architecture/layering-and-boundaries.md` and `docs/architecture/application-layer.md`.

### Value Objects (no primitives obsession)

- Aggregate/entity state and domain event members are VOs (not raw primitives).
- VOs define a canonical primitive representation (e.g. `value`/`toJSON`) and explicit reconstitution (`from(...)`).
- Never “smuggle” primitives across boundaries where a VO exists.

### `Option<T>` vs `T | null`

| Pattern     | Where                      | When                                                     |
| ----------- | -------------------------- | -------------------------------------------------------- |
| `Option<T>` | Domain, Application, Ports | Monadic chaining (`map`, `flatMap`, `fold`) adds clarity |
| `T \| null` | Infrastructure internals   | Simple optional returns without chaining                 |

**Boundary rule:** Port interfaces use `Option<T>`; infrastructure may use `T | null` internally but converts at the boundary.

**Location:** `packages/application/src/shared/Option.ts`

### Error handling

**Custom error classes:**

```typescript
// Domain errors — invariant violations
export class GoalAlreadyArchived extends Error { ... }

// Application errors — use-case failures
export class ConcurrencyError extends Error { ... }

// Infrastructure errors — technical failures
export class MissingKeyError extends Error { ... }
export class PersistenceError extends Error { ... }
```

**When to throw vs return:**

| Situation                    | Pattern                        |
| ---------------------------- | ------------------------------ |
| Invariant violation (domain) | Throw                          |
| Not found (query)            | Return `Option<T>` or `null`   |
| Concurrency conflict         | Throw `ConcurrencyError`       |
| Decryption failure           | Throw `MissingKeyError`        |
| Validation failure (command) | Throw with descriptive message |

### TypeScript safety (hard)

- Never use `any`.
- Avoid `as T`. If unavoidable, it must sit next to runtime validation (type guard, decoder, or `Assert`).
- Don’t “stringly-type” domain identifiers; use the correct VO where defined.

### Type assertions

Type assertions (`as T`) are **compile-time only**; they do not validate data at runtime.

Rules:

- Prefer **type guards / decoders** to transform `unknown` into a typed value.
- Prefer **`Assert`** for runtime preconditions and invariants (especially in Domain and Application).
- If an `as T` is unavoidable, it must be immediately adjacent to runtime validation (`Assert` and/or a type guard).

`as unknown as T` is acceptable only at serialization boundaries, and only with explicit validation nearby:

```typescript
// ✅ OK — protocol boundary, validated right after parsing
const raw: unknown = data;
if (!isWorkerResponse(raw)) throw new Error('Unexpected worker response');
const message: WorkerResponse = raw;

// ✅ OK — protocol boundary, validation expressed via Assert
Assert.that(raw, 'WorkerResponse').satisfies(isWorkerResponse);
const message2 = raw as WorkerResponse;

// ✅ OK — registry lookup returns unknown, we validate
const spec = registry.get(eventType) as PayloadEventSpec<T>;

// ❌ NOT OK — bypassing type safety for convenience
const user = data as unknown as User;
```

**Rule:** If you need `as unknown as`, you should be at a boundary with runtime validation nearby.

### Tests as contracts

- For correctness- and security-critical behavior, prefer writing the test that encodes the contract first.
- When you change a cross-cutting contract (ordering, byte preservation, rebase/rebuild), update:
  - tests, and
  - `docs/invariants.md` (if the invariant changed).

See: `docs/architecture/testing-strategy.md`.

### Async patterns

| Use       | When                                        |
| --------- | ------------------------------------------- |
| `Promise` | Application code, handlers, repositories    |
| Workers   | Long-running IO/compute; keep UI responsive |

**Rule:** Keep long-running work out of the UI thread; use worker boundaries and bounded background scheduling.

### Logging and diagnostics (principle)

- Logs should be actionable and include stable context (storeId, stage, codes).
- Never log plaintext domain content (names, descriptions, decrypted payload bytes). Treat logs as potentially shareable artifacts.
- Avoid logging free-form error messages if they can embed user-provided strings; prefer error codes/counts and stable identifiers.
- Diagnostics must never include secrets (see `INV-015`).

## Code Pointers

- `packages/domain/src/shared/Assert.ts` — runtime assertion DSL
- `packages/application/src/shared/Option.ts` — `Option<T>`

## Open Questions

- [ ] Decide which conventions to enforce via ESLint rules vs review-only.
