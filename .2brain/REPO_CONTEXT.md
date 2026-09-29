# Repo Context

_Canonical 2brain context source for AI editors._

## Core Artifacts

- `.2brain/graphify-out/GRAPH_REPORT.md` — structural and semantic code graph report
- `.2brain/EXECUTION.md` — runnable build/test/CI/migration knowledge
- `.2brain/llm-wiki/` — per-file machine-oriented pages, one per source file (page path = source path + `.md`)
- `.2brain/modules/` — human-oriented module notes, mirrored into Obsidian
- `.2brain/arch/` — component/topic pages with Mermaid diagrams
- `.2brain/repo-index.json` — semantic retrieval index backing `2brain query` (a query backend, not a document to open directly)

## Where to look

- **First contact with an unfamiliar codebase** → `.2brain/llm-wiki/OVERVIEW.md` for orientation, then `.2brain/modules/vue-toolkit_INDEX.md` for the module map.
- **Editing or reading a source file** → read `.2brain/llm-wiki/<path>.md` first (page path = source path + `.md`). It carries the file's purpose, key elements, graph neighbours, and gotchas not in the source.
- **"How is this structured?" / "where does X live?"** → `.2brain/arch/overview.md`, then the component page it points to.
- **"How do I run / build / test / deploy this?"** → `.2brain/EXECUTION.md`.
- **Anything else, or you don't know which file** → `2brain query <repo-path> "question"`.

Artifacts describe commit `4238648748c95d8499a1e02cbebece870e5a7d2f`. Before relying on a wiki page, check its source: `git diff --quiet 4238648748c95d8499a1e02cbebece870e5a7d2f -- <file>` (and `git status` for uncommitted edits). Changed → prefer the source for that file and say so. Unchanged → trust the page.

## Most-used code

Change these with care — widely depended on:

- `makeComposable()` (106 edges)
- `clearAllInstances()` (95 edges)
- `vue` (71 edges)
- `apiResolve()` (67 edges)
- `IUser` (67 edges)
- `USERS` (49 edges)
- `flush()` (48 edges)
- `makeSearchComposable()` (38 edges)
- `newTestClient()` (34 edges)
- `Testing Guide` (33 edges)

## Cross-cutting flows

- Structure CRUD Composable Family
- Loading & Observability Composables
- CI Quality Gate Jobs
- Vue Toolkit Composable Layer Architecture
- CRUD Operations to Methods Mapping
- Form Validation Submit Flow
- One-Shot Read Methods
- Active Watch Methods (useQuery)
- Optimistic Mutation Methods
- Vue Toolkit Composable Hierarchy (Data → REST → Search/CRUD)
- 5.0 Migration: TanStack Query as Shared Cache Engine
- useStructureSearchApi Core Flow (filters → applied search → page cache → display)
- Multi-layer Testing Strategy
- useStructureRestApi Test Helper Ecosystem
- Pinia Store Layer

## Index Metadata

- Provider: `ollama`
- Model: `qwen3.8:27b`
- Index revision: `77822733b45cd63649e9b402bd354b82b337e48170fdcec8320aa967220d877b`
- Indexed chunks: `1325`
- Memory entries: `0`

## Query

- Semantic query: `2brain query <repo-path> "your question" --top-k 5`
- Add durable memory: `2brain remember <repo-path> "fact/decision/runbook" --kind fact`
