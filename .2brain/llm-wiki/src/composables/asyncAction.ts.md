---
source: src/composables/asyncAction.ts
sha256: 5747d45d428c7979ac86469be96a934dd4a19b6233a041468cfa262f6ea0ebe9
generated_at: 2026-09-28T22:28:55.591706+00:00
model: ollama:qwen3.8:27b
---

# src/composables/asyncAction.ts

## Purpose

Vue composable that wraps a single async call in reactive `data` / `error` / `loading` refs. It enforces "latest run wins" via a sequence counter so out-of-order responses are dropped, and it never rejects — failures resolve into the `error` ref, suiting read-style UIs where one dead panel is preferable to a thrown exception. Intended for one-shot payloads; identified/cached/mutated records belong in the `useStructure*` family.

## Key elements

- **`useAsyncAction<T, TArgs>(action, settings?)`** — the main export. Returns `{ data, error, loading, run, reset }`.
    - `data` — `shallowRef<T | undefined>`; replaced whole on each successful run.
    - `error` — `ref<string | undefined>`; set on failure, cleared at the start of each new run.
    - `loading` — `ref<boolean>`; true while the newest run is in flight.
    - `run(...args)` — invokes `action`, returns `Promise<T | undefined>` (undefined on failure or when overtaken).
    - `reset()` — restores initial state and invalidates any in-flight run via the counter.
- **`IAsyncActionSettings<T>`** — optional config: `initialData`, `fallbackErrorMessage`, `resolveError`.
- **`TErrorResolver`** — `(error, fallback?) => string`; defaults to `extractErrorMessage` from `@guebbit/js-toolkit`.
- **`IAsyncAction<T, TArgs>`** — convenience type alias for the return type of `useAsyncAction`.
- **`OVERTAKEN`** — module-level sentinel (`undefined`) returned when a run has been superseded.

## Relationships

- **`src/internal/promiseTry.ts`** — provides `promiseTry`, which converts a synchronous throw from `action` into a rejected promise so it flows through the same `.catch` path as an async failure.
- **`package.json`** — declares the runtime dependencies (`vue`, `@guebbit/js-toolkit`) that this file imports.
- **`src/index.ts`** — barrel re-exports `useAsyncAction` (and likely its types) as part of the public API surface.
- **`tests/asyncAction.spec.ts`** — behavioral unit tests covering latest-wins, error resolution, reset, and sync-throw handling.
- **`tests/types/asyncAction.test-d.ts`** — compile-time assertions on the generics and return-type shape.

## Notes

- The file does **no** i18n itself; callers pass an already-translated `fallbackErrorMessage` or a custom `resolveError`.
- `shallowRef` is used for `data` deliberately (payloads are replaced, never mutated in place), then cast to `Ref` to keep the consumer-facing type simple.
- `reset()` bumps the sequence counter so a still-in-flight `run` cannot write to the just-cleared state.
- The Stryker-disable comments on `latest` increment lines exist because the mutation operator is a generation token — only the _change_ matters, not direction.
