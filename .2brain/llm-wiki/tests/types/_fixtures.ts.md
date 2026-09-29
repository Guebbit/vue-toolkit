---
source: tests/types/_fixtures.ts
sha256: 8c75256394259fb7ed49170976b96143769998f60c5be43c7b6e67ed05939710
generated_at: 2026-09-28T23:13:59.266976+00:00
model: ollama:qwen3.8:27b
---

# tests/types/_fixtures.ts

## Purpose

Provides a shared `IUser` record shape that the type-level (`.test-d.ts`) test files import so they can write assertions against a consistent, single definition of a user object. It exists to keep that shape in one place rather than duplicating it across every type-test file.

## Key elements

- **`IUser`** (exported interface) — A minimal user record with `id: number`, `name: string`, `email: string`. Serves as the common shape that all type-level tests assert over.

## Relationships

- **tests/types/asyncAction.test-d.ts**, **structureCrudApi.test-d.ts**, **structureDataManagement.test-d.ts**, **structureRestApi.test-d.ts**, **structureSearchApi.test-d.ts** — Each of these type-test files imports `IUser` from this fixture and uses it as the expected record type in their assertions. This file is a pure upstream dependency; it imports nothing and contains no logic of its own.

## Notes

- The underscore prefix (`_fixtures.ts`) and the absence of the `.test-d.ts` extension signal that this is a **support file**, not a test. It will not be picked up by the type-test runner.
- The interface follows an `I`-prefix naming convention (`IUser`), which is the project's convention for type aliases/interfaces (as opposed to type-test files that may use `Test*` naming).
