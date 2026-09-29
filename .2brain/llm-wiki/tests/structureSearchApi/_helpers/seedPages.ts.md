---
source: tests/structureSearchApi/_helpers/seedPages.ts
sha256: 976ba753ac96065d63121b907d1c38dac8b170472de8dab40de0782822bc3493
generated_at: 2026-09-28T23:08:15.328238+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/_helpers/seedPages.ts

## Purpose

Test helper that writes search-cache entries directly into a TanStack Query `QueryClient`, letting a spec lay out the exact cache state a predicate must judge (scope, kind, filters, page, bucket key, `dataUpdatedAt`) without triggering a network fetch per entry.

## Key elements

- **`ISeedPage`** (interface) — Describes a single cache entry to seed. All fields except `totalItems` are optional; defaults describe a page of the default-scope `'resource'` search.
- **`seedPage(client, seed)`** (function) — Builds the query key `[resourceKey, kind, scope, stableKey(filters), size, page, ...key]`, calls `client.setQueryData` with `{ ids: [], totalItems }` and an optional pinned `updatedAt`, then returns the key it wrote under.

## Relationships

- **`src/internal/plainData.ts`** — Imports `stableKey` to serialize the `filters` object into the query-key segment, matching how the composable keys its queries.
- **`tests/structureSearchApi/search/search.latestPage.spec.ts`** — Consumes `seedPage` / `ISeedPage` to pre-populate the QueryClient with deterministic pages before asserting ordering or predicate behavior.

## Notes

- Deliberately **not** named `*.spec.ts` so Jest's `testMatch` skips it; it is a plain helper module.
- The `updatedAt` option is passed via TanStack's `setQueryData` third-argument (`{ updatedAt }`) to pin freshness, making page-ordering assertions deterministic regardless of real clock time.
- `key` is an array of extra bucket-key segments appended _after_ the `page` segment in the composed query key.
