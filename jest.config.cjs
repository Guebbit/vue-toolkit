/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.spec.ts', '**/__tests__/**/*.spec.ts'],
    restoreMocks: true,
    moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs', 'jsx', 'json'],
    // Configures fast-check (numRuns, seed) before any *.property.spec.ts imports it.
    setupFiles: ['<rootDir>/tests/_setup/fastCheck.ts'],
    moduleNameMapper: {
        // @tanstack/vue-query's CJS build eagerly requires its devtools module, which require()s
        // @tanstack/match-sorter-utils — an ESM-only package. Node itself loads it (require of
        // ESM); Jest's own module loader does not, so Jest gets a stub instead. See the stub file.
        '^@tanstack/match-sorter-utils$': '<rootDir>/tests/_stubs/tanstackMatchSorterUtils.cjs',
        // src/ imports its own relative modules with a .js extension (NodeNext, so `dist` loads
        // under Node's own ESM resolver). ts-jest runs the CommonJS transform below, which resolves
        // extensionless, so strip the extension back off before Jest resolves the module.
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                // Override the project-level ESM settings (module/moduleResolution: NodeNext) with
                // CommonJS here so Jest can load modules without requiring experimental VM modules.
                // `bundler` resolution: TypeScript 6 deprecates `node` (node10), and allows
                // `bundler` alongside CommonJS output.
                tsconfig: {
                    module: 'CommonJS',
                    moduleResolution: 'bundler',
                    esModuleInterop: true
                }
            }
        ],
        // Pinia 4, and its own dependency nostics, ship ESM only: compiled to CommonJS like the
        // TypeScript above, since Jest's CommonJS loader cannot require() them as they are.
        '^.+\\.m?js$': [
            'ts-jest',
            {
                tsconfig: {
                    allowJs: true,
                    module: 'CommonJS',
                    moduleResolution: 'bundler'
                }
            }
        ]
    },
    // Everything in node_modules stays untransformed, except the ESM-only packages above.
    transformIgnorePatterns: ['/node_modules/(?!(?:pinia|nostics)/)']
};
