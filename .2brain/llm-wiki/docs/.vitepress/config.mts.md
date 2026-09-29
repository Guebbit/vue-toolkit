---
source: docs/.vitepress/config.mts
sha256: 7180ba1daa663d41d3a8dcb6ab3259f59a64e4792e236b187eba2cca9135758d
generated_at: 2026-09-28T22:27:54.683271+00:00
model: ollama:qwen3.8:27b
---

# docs/.vitepress/config.mts

## Purpose

VitePress site configuration for the `@guebbit/vue-toolkit` documentation. It defines the site identity, navigation structure, and sidebar layout, and wraps the config with `vitepress-plugin-mermaid` so that Mermaid diagram fences render as visual diagrams on pages that describe flows.

## Key elements

- **`withMermaid(defineConfig(...))`** — Wraps the VitePress config to enable Mermaid diagram rendering in Markdown code fences.
- **`title` / `description`** — Site-level metadata used by the browser tab and search engines.
- **`base`** — Serves the docs under the `/vue-toolkit/` path (relevant for GitHub Pages or subpath deploys).
- **`themeConfig.nav`** — Top navigation bar with three entries: Home, Guide, Reference.
- **`themeConfig.sidebar`** — Three grouped sections (Guide, Composables, Stores) listing every documented composable and store in the toolkit.
- **`themeConfig.socialLinks`** — A single GitHub icon linking to the `Guebbit/vue-toolkit` repository.

## Relationships

No graph neighbors detected for this file. It is a standalone build-time configuration consumed only by the VitePress CLI.

## Notes

- The sidebar lists 9 composables and 2 stores. If a new composable or store is added to the package, it **must** also be added to the sidebar here or it will be unreachable from the nav.
- `base` is hardcoded to `/vue-toolkit/`. Changing the deploy path requires updating this value; VitePress will not auto-detect it.
- `withMermaid` is applied *outside* `defineConfig`, so Mermaid is a global plugin for the entire site, not scoped to specific pages.
