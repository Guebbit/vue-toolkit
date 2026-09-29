# Graph Report - . (2026-09-28)

## Corpus Check

- cluster-only mode — file stats not available

## Summary

- 1033 nodes · 2475 edges · 90 communities (47 shown, 43 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.78)
- Token cost: 2,507 input · 4,210 output

## Graph Freshness

- Built from commit: `42386487`
- Run `2brain check /target-repo` to check if the graph is stale.
- Run `2brain /target-repo` after code changes.

## Community Hubs (Navigation)

- API Method Resolution
- Search Composable Testing
- Testing Strategy & CI
- Search & Watch API
- Form Validation Schema
- Loading State & Client
- CRUD API Definitions
- Cache Keys & Fetch
- CI Pipelines & Docs
- TypeScript Compiler Config
- CRUD API Types
- Mutation Testing Config
- Package Scripts
- Cache Freshness & Keys
- Plain Data & Scopes
- Query Store & Mutations
- Package Metadata
- Async Actions & Probes
- Record Store Operations
- Vue Watch & Settle
- Record Lookup & Pages
- Test TypeScript Config
- Resource Activity Tracking
- Data Management & IDs
- Upload Progress Tracking
- Type Definition Tests
- Pinia Core Store
- Dev Dependencies
- Package Keywords
- Fake Server Testing
- Type-Check Config
- Data Management Types
- Record Mutations Context
- Notifications Store
- Peer Dependencies
- Relation Store Operations
- Record Store Tests
- Identifier Joining
- Liveness Probe Tests
- Type Surface Guard
- Project Files
- Relation Store Tests
- Notifications Documentation
- Toolkit Dependency
- Shell Scripts
- Optional Peer Deps
- Repository Info
- Type Check CLI
- Commit Lint CLI
- Commit Lint Config
- ESLint
- ESLint Prettier Config
- ESLint JS
- ESLint JSDoc Plugin
- ESLint Prettier Plugin
- ESLint Unicorn Plugin
- ESLint Vue Plugin
- ESLint Globals
- Apply Patch Hook
- Commit Message Hook
- Husky Setup Script
- Post Apply Patch Hook
- Post Checkout Hook
- Post Commit Hook
- Post Merge Hook
- Post Rewrite Hook
- Pre Apply Patch Hook
- Pre Auto GC Hook
- Pre Commit Hook
- Pre Merge Commit Hook
- Pre Push Hook
- Pre Rebase Hook
- Prepare Commit Hook
- JSDOM Test Environment
- Mermaid Diagrams
- Prettier Formatter
- Package Lint Tool
- Stryker Mutation Core
- Stryker Jest Runner
- TS Jest Transformer
- ESLint Type Definitions
- Jest Type Definitions
- TypeScript ESLint Parser
- VitePress Docs
- VitePress Mermaid Plugin
- Vue ESLint TS Config
- Data Management Tests

## God Nodes (most connected - your core abstractions)

1. `makeComposable()` - 106 edges
2. `clearAllInstances()` - 95 edges
3. `vue` - 71 edges
4. `apiResolve()` - 67 edges
5. `IUser` - 67 edges
6. `USERS` - 49 edges
7. `flush()` - 48 edges
8. `makeSearchComposable()` - 38 edges
9. `newTestClient()` - 34 edges
10. `Testing Guide` - 33 edges

## Surprising Connections (you probably didn't know these)

- `Property-based Testing (Concept)` --references--> `fast-check` [EXTRACTED]
  docs/guide/testing.md → package.json
- `tests/internal/plainData.property.spec.ts` --references--> `fast-check` [EXTRACTED]
  docs/guide/testing.md → package.json
- `tests/structureDataManagement/property.spec.ts` --references--> `fast-check` [EXTRACTED]
  docs/guide/testing.md → package.json
- `useStructureCrudApi` --references--> `pinia` [EXTRACTED]
  docs/composables/structure-crud-api.md → package.json
- `useNotificationsStore Documentation` --references--> `pinia` [EXTRACTED]
  docs/stores/notifications.md → package.json

## Import Cycles

- 3-file cycle: `src/composables/structureRestApi.ts -> src/internal/restResource.ts -> src/internal/freshnessChecks.ts -> src/composables/structureRestApi.ts`
- 3-file cycle: `src/composables/structureRestApi.ts -> src/internal/restResource.ts -> src/internal/resourceMutations.ts -> src/composables/structureRestApi.ts`
- 3-file cycle: `src/composables/structureRestApi.ts -> src/internal/restResource.ts -> src/internal/settleCallbacks.ts -> src/composables/structureRestApi.ts`
- 3-file cycle: `src/composables/structureRestApi.ts -> src/internal/restResource.ts -> src/internal/tanstackQueryOptions.ts -> src/composables/structureRestApi.ts`

## Hyperedges (group relationships)

- **Structure CRUD Composable Family** — readme_use_structure_crud_api, readme_use_structure_rest_api, readme_use_structure_search_api, readme_use_structure_data_management [EXTRACTED 0.95]
- **Loading & Observability Composables** — readme_use_is_loading, readme_use_liveness_probe, readme_use_async_action, readme_use_core_store [INFERRED 0.80]
- **CI Quality Gate Jobs** — _github_workflows_ci, _github_workflows_release, claude_quality_gate, _github_workflows_ci_test_peer_floor [EXTRACTED 0.90]
- **Vue Toolkit Composable Layer Architecture** — docs_composables_structure_data_management_usestructuredatamanagement, usestructurerestapi, usestructuresearchapi, docs_composables_structure_crud_api_usestructurecrudapi, docs_composables_structure_form_validation_usestructureformvalidation [EXTRACTED 0.90]
- **CRUD Operations to Methods Mapping** — docs_composables_structure_crud_api_istructurecrudoperations, docs_composables_structure_crud_api_usestructurecrudapi, docs_composables_structure_crud_api_isearchresult [EXTRACTED 0.90]
- **Form Validation Submit Flow** — docs_composables_structure_form_validation_usestructureformvalidation, docs_composables_structure_form_validation_ivalidationschema, docs_composables_structure_form_validation_iapplyservererrorsoptions, docs_composables_structure_form_validation_ifieldcontainer [EXTRACTED 0.85]
- **One-Shot Read Methods** — docs_composables_structure_rest_api_fetchall, docs_composables_structure_rest_api_fetchtarget, docs_composables_structure_rest_api_fetchbyparent, docs_composables_structure_rest_api_fetchpaginate, docs_composables_structure_rest_api_fetchmultiple, docs_composables_structure_rest_api_fetchany [EXTRACTED 0.95]
- **Active Watch Methods (useQuery)** — docs_composables_structure_rest_api_watchtarget, docs_composables_structure_rest_api_watchall, docs_composables_structure_rest_api_watchbyparent, docs_composables_structure_rest_api_watchany, docs_composables_structure_rest_api_iwatchhandle [EXTRACTED 0.95]
- **Optimistic Mutation Methods** — docs_composables_structure_rest_api_createtarget, docs_composables_structure_rest_api_updatetarget, docs_composables_structure_rest_api_deletetarget, docs_composables_structure_rest_api_mutateany [EXTRACTED 0.95]
- **Vue Toolkit Composable Hierarchy (Data → REST → Search/CRUD)** — docs_guide_getting_started_usestructuredatamanagement, docs_guide_getting_started_usestructurerestapi, docs_guide_getting_started_usestructuresearchapi, docs_guide_getting_started_usestructurecrudapi [EXTRACTED 0.90]
- **5.0 Migration: TanStack Query as Shared Cache Engine** — docs_guide_migration_usestructurerestapi, docs_guide_migration_tanstack_vue_query, docs_guide_migration_queryclient, docs_guide_migration_vuequeryplugin, docs_guide_migration_tanstack_query_core [EXTRACTED 0.95]
- **useStructureSearchApi Core Flow (filters → applied search → page cache → display)** — docs_composables_structure_search_api_usestructuresearchapi, docs_composables_structure_search_api_watchsearch, docs_composables_structure_search_api_fetchsearch, docs_composables_structure_search_api_istructuresearchapi [EXTRACTED 0.90]
- **Multi-layer Testing Strategy** — jest, fast_check, expect_type, stryker, tanstack_query_client [EXTRACTED 0.95]
- **useStructureRestApi Test Helper Ecosystem** — tests_structure_rest_api_helpers_harness, tests_structure_rest_api_helpers_fake_server, tests_structure_rest_api_helpers_fake_api, tests_structure_rest_api_helpers_fixtures, tests_structure_rest_api_helpers_time [EXTRACTED 0.95]
- **Pinia Store Layer** — use_core_store, use_notifications_store, pinia [EXTRACTED 0.90]

## Communities (90 total, 43 thin omitted)

### Community 0 - "API Method Resolution"

Cohesion: 0.07
Nodes (69): C, cases, IMethodCase, list, trackLoading(), watchers, apiReject(), apiResolve() (+61 more)

### Community 1 - "Search Composable Testing"

Cohesion: 0.06
Nodes (49): deferred(), buildArticles(), IArticle, advance(), BASE_NOW, restoreClock(), useFakeClock(), article() (+41 more)

### Community 2 - "Testing Strategy & CI"

Cohesion: 0.06
Nodes (52): Browser-mode Testing (Concept), Built-package & Peer-floor Testing (Concept), docs/composables/structure-rest-api.md, Testing Guide, expect-type, fast-check, .github/workflows/ci.yml, .github/workflows/mutation.yml (+44 more)

### Community 3 - "Search & Watch API"

Cohesion: 0.05
Nodes (52): fetchSearch, ISearchFetchContext, useStructureCrudApi (referenced), useStructureRestApi (referenced), IStructureRestApiOptions, IStructureSearchApi, IWatchSearchHandle, IWatchSearchSettings (+44 more)

### Community 4 - "Form Validation Schema"

Cohesion: 0.06
Nodes (33): IApplyServerErrorsOptions, IFieldContainer, IStructureFormValidation, IStructureFormValidationOptions, IValidationIssue, IValidationSchema, useStructureFormValidation, zod (+25 more)

### Community 5 - "Loading State & Client"

Cohesion: 0.09
Nodes (32): useIsLoading(), useStructureCrudApi(), useStructureRestApi(), matchesAnyPrefix(), browserClient(), make(), mountedClients, setup() (+24 more)

### Community 6 - "CRUD API Definitions"

Cohesion: 0.11
Nodes (31): ICreateOneSettings, IDeleteOneSettings, IStructureCrudApi, IStructureCrudApiOptions, IStructureCrudOperations, IUpdateOneSettings, TIdOf, IFetchContext (+23 more)

### Community 7 - "Cache Keys & Fetch"

Cohesion: 0.08
Nodes (34): Cache Key Structure, createTarget, deleteTarget, dependsOn, fetchAll, fetchAny, fetchByParent, fetchMultiple (+26 more)

### Community 8 - "CI Pipelines & Docs"

Cohesion: 0.10
Nodes (32): CI Pipeline, Peer Floor Test Job, Docs Deployment Pipeline, Mutation Testing Pipeline, Release Pipeline, Project Conventions & Guidelines, Quality Gate (complete:check), useAsyncAction Documentation (+24 more)

### Community 9 - "TypeScript Compiler Config"

Cohesion: 0.08
Nodes (24): dom, esnext, node_modules, compilerOptions, allowSyntheticDefaultImports, declaration, declarationDir, esModuleInterop (+16 more)

### Community 10 - "CRUD API Types"

Cohesion: 0.11
Nodes (24): ICreateOneSettings, IDeleteOneSettings, IFetchContext, IFetchSettings, ISearchResult, IStructureCrudApi, IStructureCrudApiOptions, IStructureCrudOperations (+16 more)

### Community 11 - "Mutation Testing Config"

Cohesion: 0.08
Nodes (23): clear-text, html, progress, !src/index.ts, concurrency, coverageAnalysis, htmlReporter, fileName (+15 more)

### Community 12 - "Package Scripts"

Cohesion: 0.09
Nodes (23): scripts, build, check:clean, complete, complete:check, docs:build, docs:dev, docs:preview (+15 more)

### Community 13 - "Cache Freshness & Keys"

Cohesion: 0.16
Nodes (15): ISearchCacheEntry, IFreshnessContext, createQueryRelationStore(), IParentRelationsContext, IQueryRecordStoreContext, createResourceKeys(), IKeyed, IListCacheEntry (+7 more)

### Community 14 - "Plain Data & Scopes"

Cohesion: 0.15
Nodes (11): detachedCopy(), expandCollections(), isPlainObject(), stableKey(), countsFor(), registries, scopeRegistryFor(), Address (+3 more)

### Community 15 - "Query Store & Mutations"

Cohesion: 0.23
Nodes (15): createFreshnessChecks(), isNil(), createQueryRecordStore(), dropQueries(), LIST_KINDS, createResourceMutations(), createRestResource(), IRunningQuery (+7 more)

### Community 16 - "Package Metadata"

Cohesion: 0.12
Nodes (17): author, bugs, url, description, engines, node, exports, homepage (+9 more)

### Community 17 - "Async Actions & Probes"

Cohesion: 0.18
Nodes (9): IAsyncAction, IAsyncActionSettings, TErrorResolver, useAsyncAction(), ILivenessProbe, ILivenessProbeSettings, useLivenessProbe(), promiseTry() (+1 more)

### Community 18 - "Record Store Operations"

Cohesion: 0.22
Nodes (5): IRecordStore, useStructureDataManagement(), flush(), IItem, make()

### Community 19 - "Vue Watch & Settle"

Cohesion: 0.20
Nodes (9): settledResult(), useStructureSearchApi(), ISettleReaders, watchSettled(), watch(), pageKey(), buildInComponent(), teardown (+1 more)

### Community 20 - "Record Lookup & Pages"

Cohesion: 0.16
Nodes (10): recordListByIds(), recordsByIds(), idArbitrary, idOf, IModelItem, IPageItem, modelOpArbitrary, pageItemsArbitrary (+2 more)

### Community 21 - "Test TypeScript Config"

Cohesion: 0.15
Nodes (12): jest, node, tests/**/\*.ts, tests/**/*.tsx, compilerOptions, module, moduleResolution, types (+4 more)

### Community 22 - "Resource Activity Tracking"

Cohesion: 0.28
Nodes (10): hasKeyPrefix(), canWrite(), recordMutationsOf(), changesData(), DATA_ACTIONS, IActivityMeta, keyOf(), STATUS_EVENTS (+2 more)

### Community 23 - "Data Management & IDs"

Cohesion: 0.26
Nodes (6): createLocalRelationStore(), keyOf(), sameId(), uniqueIds(), ITestItem, IItem

### Community 24 - "Upload Progress Tracking"

Cohesion: 0.18
Nodes (8): ITrackUploadSettings, IUploadProgress, TUploadOptionsBuilder, TUploadProgressReporter, useUploadProgress(), IRequestOptions, upload, IFakeOptions

### Community 25 - "Type Definition Tests"

Cohesion: 0.24
Nodes (7): action, IUser, crud, IRequestOptions, writable, resource, watchHandle

### Community 26 - "Pinia Core Store"

Cohesion: 0.25
Nodes (6): useCoreStore Documentation, pinia, pinia, useCoreStore, useCoreStore (Pinia Store), useIsLoading (Composable)

### Community 27 - "Dev Dependencies"

Cohesion: 0.18
Nodes (11): eslint-plugin-oxlint, husky, devDependencies, eslint-plugin-oxlint, husky, jest, typescript-eslint, @typescript-eslint/eslint-plugin (+3 more)

### Community 28 - "Package Keywords"

Cohesion: 0.18
Nodes (11): typescript, keywords, composables, crud, forms, rest, tanstack-query, validation (+3 more)

### Community 29 - "Fake Server Testing"

Cohesion: 0.20
Nodes (9): createServer(), IServerCalls, IServerOptions, boolean, commandArbitrary, creatableId, existingId, ID_SPACE (+1 more)

### Community 30 - "Type-Check Config"

Cohesion: 0.22
Nodes (8): tests/types, compilerOptions, noEmit, rootDir, extends, include, src, ./tsconfig.json

### Community 31 - "Data Management Types"

Cohesion: 0.22
Nodes (8): IStructureDataManagementApi, c, incompleteRecordStore, ISlugged, minimalRecordStore, minimalRelationStore, withCompositeId, withNoId

### Community 32 - "Record Mutations Context"

Cohesion: 0.33
Nodes (8): IFetchSettings, IQueryRecordStore, IRecordSnapshot, IRecordMutationMeta, ITargetEntry, IRecordOperations, IResourceMutationsContext, IScopeRegistry

### Community 33 - "Notifications Store"

Cohesion: 0.39
Nodes (5): EToastType, IToastMessage, useNotificationsStore, core, notifications

### Community 34 - "Peer Dependencies"

Cohesion: 0.29
Nodes (7): @tanstack/vue-query, peerDependencies, pinia, @tanstack/vue-query, vue, zod, @tanstack/vue-query

### Community 36 - "Record Store Tests"

Cohesion: 0.33
Nodes (5): ALICE, BOB, IItem, make(), spyStore()

### Community 37 - "Identifier Joining"

Cohesion: 0.67
Nodes (4): escapeCharacterFor(), escapeSegment(), joinIdentifiers(), segmentOf()

### Community 39 - "Type Surface Guard"

Cohesion: 0.33
Nodes (5): ALWAYS_FORBIDDEN, distTypesRoot, dtsFiles, offenders, PUBLIC_SURFACE_FORBIDDEN

### Community 40 - "Project Files"

Cohesion: 0.40
Nodes (5): files, dist, CHANGELOG, LICENSE, README.md

### Community 41 - "Relation Store Tests"

Cohesion: 0.50
Nodes (3): IItem, make(), spyStore()

### Community 42 - "Notifications Documentation"

Cohesion: 0.83
Nodes (4): useNotificationsStore Documentation, EToastType (Enum), IToastMessage (Interface), useNotificationsStore (Pinia Store)

### Community 43 - "Toolkit Dependency"

Cohesion: 0.67
Nodes (3): @guebbit/js-toolkit, dependencies, @guebbit/js-toolkit

### Community 45 - "Optional Peer Deps"

Cohesion: 0.67
Nodes (3): peerDependenciesMeta, zod, optional

### Community 46 - "Repository Info"

Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps

- **342 isolated node(s):** `husky.sh script`, `name`, `version`, `description`, `vue3` (+337 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **43 thin communities (<3 nodes) omitted from report** — run `2brain query /target-repo "..."` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `vue` connect `Vue Watch & Settle` to `API Method Resolution`, `Search Composable Testing`, `Testing Strategy & CI`, `Form Validation Schema`, `Loading State & Client`, `CRUD API Definitions`, `Cache Freshness & Keys`, `Plain Data & Scopes`, `Query Store & Mutations`, `Async Actions & Probes`, `Record Store Operations`, `Resource Activity Tracking`, `Data Management & IDs`, `Upload Progress Tracking`, `Type Definition Tests`, `Pinia Core Store`, `Dev Dependencies`, `Package Keywords`, `Fake Server Testing`, `Data Management Types`, `Record Mutations Context`, `Notifications Store`, `Peer Dependencies`, `Relation Store Operations`, `Record Store Tests`, `Liveness Probe Tests`, `Relation Store Tests`?**
  _High betweenness centrality (0.311) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Dev Dependencies` to `Testing Strategy & CI`, `Form Validation Schema`, `Package Metadata`, `Pinia Core Store`, `Package Keywords`, `Peer Dependencies`, `Type Check CLI`, `Commit Lint CLI`, `Commit Lint Config`, `ESLint`, `ESLint Prettier Config`, `ESLint JS`, `ESLint JSDoc Plugin`, `ESLint Prettier Plugin`, `ESLint Unicorn Plugin`, `ESLint Vue Plugin`, `ESLint Globals`, `JSDOM Test Environment`, `Mermaid Diagrams`, `Prettier Formatter`, `Package Lint Tool`, `Stryker Mutation Core`, `Stryker Jest Runner`, `TS Jest Transformer`, `ESLint Type Definitions`, `Jest Type Definitions`, `TypeScript ESLint Parser`, `VitePress Docs`, `VitePress Mermaid Plugin`, `Vue ESLint TS Config`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `keywords` connect `Package Keywords` to `Package Metadata`, `Pinia Core Store`, `Vue Watch & Settle`, `Form Validation Schema`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **What connects `husky.sh script`, `name`, `version` to the rest of the system?**
  _342 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Method Resolution` be split into smaller, more focused modules?**
  _Cohesion score 0.06662781662781662 - nodes in this community are weakly interconnected._
- **Should `Search Composable Testing` be split into smaller, more focused modules?**
  _Cohesion score 0.05502392344497608 - nodes in this community are weakly interconnected._
- **Should `Testing Strategy & CI` be split into smaller, more focused modules?**
  _Cohesion score 0.0602322206095791 - nodes in this community are weakly interconnected._
