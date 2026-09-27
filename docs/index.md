---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
    name: '@guebbit/vue-toolkit'
    text: 'Composables for CRUD screens'
    tagline: Caching, optimistic updates, and rollback — without hand-rolling any of it.
    actions:
        - theme: brand
          text: Getting Started
          link: /guide/getting-started
        - theme: alt
          text: useStructureRestApi
          link: /composables/structure-rest-api

features:
    - title: Optimistic updates, automatic rollback
      details: Update or delete a record and the UI changes immediately. If the request fails, the previous value comes back on its own — no manual rollback code.
    - title: Stable cache keys, none of them yours to write
      details: Filters, pages, and identifiers are normalized into cache keys for you — equal filters in any key order hit the same cache bucket automatically.
    - title: Live watchers, lasting data
      details: Every watch* call is an active query that refetches on invalidation or a user/language switch, and stops with the component or store that created it. The records stay cached on purpose — stale data keeps the screen rendered while a fresh copy loads.
---
