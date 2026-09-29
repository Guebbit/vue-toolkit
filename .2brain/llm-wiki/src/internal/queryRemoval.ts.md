---
source: src/internal/queryRemoval.ts
sha256: 59a6c956bc65ebbf4a25bc1fc114ec2a6119d23b37159b4b2467d77b09fb47d9
generated_at: 2026-09-28T22:34:30.444364+00:00
model: ollama:qwen3.8:27b
---

# src/internal/queryRemoval.ts

## Purpose

Provides a safe way to remove queries from a TanStack Vue Query `QueryClient` without orphaning active `useQuery` watchers. Because TanStack does not notify an observer when its query leaves the cache (detaching it permanently from invalidation/focus events), this module resets observed queries in place rather than removing them.

## Key elements

- **`dropQueries(queryClient, predicate, refetch?)`** — The sole export. Selects queries matching `predicate`, removes the unobserved ones via `queryClient.removeQueries`, and resets the observed ones (via `resetQueries` or manual `query.reset()`). When `refetch` is `true`, the reset step also triggers a fresh fetch on enabled watchers.

## Relationships

No direct import or call into any of the listed graph neighbors (`queryRecordStore.ts`, `restResource.ts`, `tests/package/smoke.mjs`) is present in this file. The file's only external dependency is `@tanstack/vue-query` (types `Query`, `QueryClient`).

## Notes

- The two-pass design (remove unobserved → reset observed) is intentional: calling `removeQueries` on an observed query would silently detach the watcher from all future cache events.
- The `refetch` branch uses `resetQueries` (which resets _and_ refetches active queries), while the non-refetch branch calls `query.reset()` directly to avoid an unwanted fetch.
- `predicate` receives a `Query` object, not a query key, so callers can filter on state (e.g., `query.state.status`) as well as key.
- The module is marked `@module internal/queryRemoval`; it is not part of the public API surface.
