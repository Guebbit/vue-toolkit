/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.spec.ts', '**/__tests__/**/*.spec.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
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
                // Override the project-level ESM settings (module: ESNext, moduleResolution: bundler)
                // with CommonJS here so Jest can load modules without requiring experimental VM modules.
                tsconfig: {
                    module: 'CommonJS',
                    moduleResolution: 'node',
                    esModuleInterop: true
                }
            }
        ]
    }
};
