## What this repo is

A published npm library (`@guebbit/vue-toolkit`): Vue 3 composables and Pinia stores built on
`@tanstack/vue-query`. Every export of `src/index.ts` is public API that other apps depend on.

- Semver applies. A breaking change only ships in a major version, and every breaking change is
  listed in `CHANGELOG` under that version, marked **BREAKING**, with its migration.
- Every user-visible change (added, changed, removed, fixed) gets a `CHANGELOG` line.
- Every public composable or store has a page in `docs/` and an entry in the vitepress sidebar
  (`docs/.vitepress/config.mts`). Its options, return shape and defaults match the source.
- Quality gate: `npm run complete:check` (lint, prettier, build, test, docs build) passes.

## TypeScript

- MUST NOT use `any` — use `unknown` plus type narrowing.
- One accepted exception: the record-type constraint `T extends Record<string | number, any>`
  (with its `eslint-disable-next-line`). `unknown` there would reject plain interfaces, which have
  no index signature. Nothing else gets `any`.

## Function design

- MUST apply SOLID principles.
- MUST keep functions focused — one responsibility each.
- MUST keep nesting ≤ 3 levels; extract a helper for anything deeper.
- MUST prefer pure functions and shared abstractions over duplicated inline logic.
- Internal machinery stays internal: anything shared between composables but not meant for apps
  lives under `src/internal/` (never re-exported by `src/index.ts`), never on a composable's
  returned object.

## Scope

- MUST NOT keep backward-compatibility shims (old option names, deprecated aliases, dual paths)
  unless the user explicitly asks for it. Replace, don't shim — the major version and the
  `CHANGELOG` migration note are how consumers move over.
- MUST NOT leave deprecated code in place — no `@deprecated` tag kept "for later." When a change
  supersedes something, remove it in the same change.

## Async and error handling

- **Prefer promise chaining** (`.then`/`.catch`/`.finally`) when there are only 1–2 awaits.
- Use `async`/`await` only when several sequential awaits make chaining unreadable.
- **Avoid `try`/`catch`** unless genuinely necessary — synchronous throws, or multi-step
  transactions with partial rollback.
- MUST handle errors explicitly — no swallowed promises. A reactive API that cannot reject
  (a watcher, an active query) exposes its error instead: an `error` ref or an `onError` callback.

## Comments

- Exported functions, interfaces, types and enums: JSDoc REQUIRED — `jsdoc/require-jsdoc`. An
  interface states its purpose and what each field means; a function adds `@param`/`@returns`/
  `@throws` **as needed**. "As needed" is yours to judge, but a tag you do write is checked:
  `jsdoc/check-param-names` refuses a name that is not in the signature, `check-tag-names` refuses
  a tag that is not a tag, and the `*-description` rules refuse an empty one.
- Every `.ts` file **under `src/`**: a JSDoc `@module` header at the top explaining the **logic or
  pattern** the file follows — what it is and how it works, not what it is for in an app. Keep it
  short: a few lines, enough to orient someone opening the file cold. If it grows into prose, it
  belongs in `docs/`. One `@module` header per file, always.

    `tests/**` is outside the rule, and `eslint.config.ts` scopes `jsdoc/*` to `src/**` to match.
    Specs are free to open with a file-level docblock describing what they pin down.

- Non-trivial internal helpers: a concise inline or JSDoc explanation.
- Comments MUST be brief theory-level notes on what the code does and its role — ADHD friendly,
  not line-by-line narration.
- Docs describing flow, architecture or process MUST include Mermaid diagrams
  (`vitepress-plugin-mermaid` renders ` ```mermaid ` fences).
- Never narrate history — no "this used to...", "previously...", "was renamed from...", "new in
  5.0". A comment describes the code as it is now; git log and `CHANGELOG` are where the past
  lives. Likewise no process notes ("verified", "reproduced against the installed package") — state
  the fact the code relies on, not how it was found.
- Never link to a `.md` file outside `docs/*` — a root-level plan, audit, or report doc is
  ephemeral and is not published; only `docs/` is a stable target for a comment to point at.

Comments are **not** a replacement for the documentation. They are code-centric: they explain the
code in front of you, and give a quick overview of what the docs already say in full. The
reasoning, the alternatives and the diagrams live in `docs/` — a comment points at that, it does
not reproduce it.

## Code layout

Orderly, scannable files. Two rules, always:

- **Every top-level declaration gets JSDoc.** Top-level means the outermost body of the file —
  and also the outermost body of whatever construct owns most of the file (a composable, a store
  definition, a factory). Constants, types, helpers, refs, computeds, actions, exported and
  internal alike: each one carries its own JSDoc block.
- **One blank line between them.** Every top-level declaration is separated from its neighbours by
  a single empty line — Prettier's formatting has no way to preserve more than one, so this is the
  enforced ceiling, not just the floor — so the JSDoc block visually belongs to the thing below it.
  Inside a declaration, blank lines are fine as needed.

```ts
/**
 * Rows currently visible after the active filter.
 */
const visibleRows = computed(() => rows.value.filter(isVisible));

/**
 * Reloads the table, discarding any optimistic edits.
 *
 * @throws {FetchError} When the endpoint is unreachable.
 */
const reload = () => fetchRows().then(applyRows);
```

## Commenting external calls

Calls into an external dependency are the code we forget fastest — the parameters are someone
else's vocabulary, not ours. Here that mostly means TanStack Query (`QueryClient`, `useQuery`,
`MutationObserver`) and Vue's reactivity API.

- Any class instantiation or method call from an external dependency with **non-obvious
  parameters** MUST be annotated: either a brief comment above the call, or a JSDoc block
  documenting each unclear parameter.
- Annotate the parameters that are not immediately clear — magic numbers, bare booleans,
  option objects, positional arguments whose meaning comes only from the library's docs. Skip the
  self-evident ones.
- Prefer more comments over fewer. When in doubt, write it.

All of it ADHD friendly: short lines, one idea per line, plain language, the "why" before the
"how". No paragraphs, no restating the code.

```ts
// TanStack: write a record without counting it as freshly fetched.
queryClient.setQueryData(
    key,
    { data: item },
    { updatedAt: previousUpdatedAt ?? 0 } // 0 = stale, so the next read asks the server
);
```

## Tests

- Jest + ts-jest, specs under `tests/`, grouped by composable. Shared factories and fakes live in
  each suite's `_helpers/` — reuse them instead of re-creating a `QueryClient` or a flush helper.
- Every spec tears down what it builds (`afterEach(clearAllInstances)` or an explicit
  `scope.stop()`); nothing leaks into the next test.
- A bug fix comes with a regression test that fails without the fix.
- Jest runs in Node, where TanStack treats the environment as a server (`gcTime` defaults to
  `Infinity`). Browser-only behaviour such as garbage collection is asserted through explicit
  options, never assumed from the defaults.
