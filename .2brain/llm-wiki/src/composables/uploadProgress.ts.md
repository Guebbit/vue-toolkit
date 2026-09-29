---
source: src/composables/uploadProgress.ts
sha256: b35ed55274fcd500d3a8c423e1ce5359db96ab6804ea54c5445caa266929d3e4
generated_at: 2026-09-28T22:31:58.054966+00:00
model: ollama:qwen3.8:27b
---

# src/composables/uploadProgress.ts

## Purpose

A Vue composable that exposes a single reactive `progress` ref (and a `track()` wrapper) for upload progress, decoupled from any specific HTTP client. Callers supply a one-time options builder; the composable handles clamping, idle/in-flight state, stale-report suppression, and guaranteed reset regardless of how the request resolves.

## Key elements

- **`TUploadProgressReporter`** — `(fraction: number) => void`; the sink a client calls with a 0–1 progress fraction.
- **`TUploadOptionsBuilder<TOptions>`** — `(onProgress) => TOptions`; the sole client-specific seam. Write it once per app to turn the reporter into your HTTP client's per-call options.
- **`ITrackUploadSettings`** — `{ enabled?: boolean }`; pass `enabled: false` to skip tracking (e.g. optional file fields where a 0→100 flash reads as a glitch).
- **`useUploadProgress<TOptions>(buildOptions)`** — the composable factory. Returns:
    - `progress: Ref<number | undefined>` — `undefined` = idle, `0`–`100` = in flight.
    - `isUploading: ComputedRef<boolean>` — true whenever `progress` is not `undefined`.
    - `report(fraction)` — records a progress tick (clamped 0–100).
    - `reset()` — returns to idle (`progress = undefined`).
    - `track(send, settings?)` — wraps a promise-based `send` call; sets progress to 0 immediately, attaches the reporter via `buildOptions`, resets in `finally`, and returns whatever `send` produced (rejections propagate unchanged).
- **`IUploadProgress<TOptions>`** — `ReturnType<typeof useUploadProgress<TOptions>>`; convenient alias for the composable's return shape.

## Relationships

- **`src/internal/promiseTry.ts`** — imported as `promiseTry`; used inside `track()` to convert synchronous throws (from `send` or `buildOptions`) into rejected promises so the `.finally` reset always runs and callers never see an escaped exception.
- **`src/index.ts`** — package entry point; expected to re-export this composable for consumers.
- **`tests/uploadProgress.spec.ts`** — runtime unit tests for the composable's behavior (clamping, token invalidation, `enabled: false`, reset-on-reject).
- **`tests/types/uploadProgress.test-d.ts`** — compile-time type assertions on the exported types and generic signatures.
- **`package.json`** — declares the `vue` peer/dev dependency (`ref`, `computed`) and the project's build/test tooling.

## Notes

- **`undefined` ≠ `0`.** `undefined` means "no upload in flight" (hide the bar); `0` means "request started, first byte not yet reported" (show the bar). A fast connection may never emit a progress event, so `track()` seeds `0` synchronously to guarantee the bar appears.
- **Token-based stale suppression.** Each `track()` call increments `currentTrackToken`. A progress report or reset from a call whose token no longer matches the current one is dropped, preventing a slow/overlapping upload from clobbering the bar owned by a newer one.
- **Clamping is intentional.** HTTP clients can report `loaded > total` (stale headers, chunked encoding), yielding fractions > 1. Without the `Math.min(…, 1)` clamp, a CSS `width: 137%` bar breaks layout.
- **`enabled: false` path bypasses the token.** It calls `promiseTry(() => send())` directly without touching `progress`, so it cannot interfere with a concurrently tracked upload.
- **Stryker mutation note.** The `++currentTrackToken` line carries a Stryker disable comment (`UpdateOperator`) because only the value change matters, not the direction of increment.
