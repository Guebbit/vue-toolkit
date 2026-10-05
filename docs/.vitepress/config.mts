import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
// The package's own manifest: the docs show the version they were built from, never a copy of it.
import pkg from '../../package.json'

/** The release these docs describe, read from package.json at build time. */
const version: string = pkg.version

/** The GitHub repository the docs (and the package) live in. */
const repository = 'https://github.com/Guebbit/vue-toolkit'

// https://vitepress.dev/reference/site-config
// withMermaid: renders ```mermaid fences as diagrams (the pages that describe a flow use them).
export default withMermaid(defineConfig({
  title: '@guebbit/vue-toolkit',
  description: 'Vue 3 composables and Pinia stores for CRUD screens: caching, optimistic updates, rollback, and form validation.',
  base: '/vue-toolkit/',

  // Per-page "last updated" time, from the page's last git commit.
  lastUpdated: true,

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/composables/structure-crud-api' },
      {
        // Which release these pages describe: compare it with the version you have installed.
        text: `v${version}`,
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: `npm: ${version}`, link: `https://www.npmjs.com/package/${pkg.name}/v/${version}` },
          { text: 'Releases', link: `${repository}/releases` }
        ]
      }
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Your first CRUD screen', link: '/guide/first-crud-screen' },
          { text: 'Migrating from 4.x', link: '/guide/migration' },
          { text: 'Changelog', link: '/changelog' }
        ]
      },
      {
        text: 'Resources',
        items: [
          { text: 'useStructureCrudApi', link: '/composables/structure-crud-api' },
          { text: 'useStructureSearchApi', link: '/composables/structure-search-api' },
          { text: 'useStructureRestApi', link: '/composables/structure-rest-api' },
          { text: 'useStructureDataManagement', link: '/composables/structure-data-management' }
        ]
      },
      {
        text: 'Forms and calls',
        items: [
          { text: 'useStructureFormValidation', link: '/composables/structure-form-validation' },
          { text: 'useUploadProgress', link: '/composables/upload-progress' },
          { text: 'useAsyncAction', link: '/composables/async-action' },
          { text: 'useLivenessProbe', link: '/composables/liveness-probe' }
        ]
      },
      {
        text: 'Loading and stores',
        items: [
          { text: 'useIsLoading', link: '/composables/is-loading' },
          { text: 'useCoreStore', link: '/stores/core' },
          { text: 'useNotificationsStore', link: '/stores/notifications' }
        ]
      },
      {
        text: 'Contributing',
        items: [
          { text: 'Development', link: '/guide/development' },
          { text: 'Testing', link: '/guide/testing' }
        ]
      }
    ],

    // Headings shown in the "On this page" column: ## and ###.
    outline: [2, 3],

    // Built into the static bundle: no external search service.
    search: { provider: 'local' },

    editLink: {
      pattern: `${repository}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub'
    },

    // Rendered under every page as "v<version> · Last updated: <date>".
    lastUpdated: { text: `v${version} · Last updated` },

    // The default theme only shows the footer on pages without a sidebar (the home page).
    footer: {
      message: `Documentation for ${pkg.name} v${version}. Released under the AGPL-3.0 license.`
    },

    socialLinks: [{ icon: 'github', link: repository }]
  }
}))
