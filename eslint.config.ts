import eslint from '@eslint/js';
import globals from 'globals';
import pluginUnicorn from 'eslint-plugin-unicorn';
import { globalIgnores } from 'eslint/config';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';
import pluginOxlint from 'eslint-plugin-oxlint';
import pluginJsdoc from 'eslint-plugin-jsdoc';

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
    {
        files: ['**/*.{ts,mts,tsx,vue}']
    },

    /**
     * Excluded files
     */
    globalIgnores(['**/dist/**', '**/docs/**', '**/node_modules/**', '**/eslint.config.ts']),

    /**
     * Base eslint
     */
    eslint.configs.recommended,

    /**
     * Vue + Typescript presets
     */
    pluginVue.configs['flat/essential'],
    vueTsConfigs.recommended,
    ...pluginOxlint.configs['flat/recommended'],

    /**
     * Unicorn plugin
     */
    pluginUnicorn.configs['flat/recommended'],

    /**
     * Global parser + dedicated eslint tsconfig
     */
    {
        languageOptions: {
            parserOptions: {
                extraFileExtensions: ['.vue']
            }
        }
    },

    /**
     * All global rules
     */
    {
        languageOptions: {
            globals: {
                ...globals.browser
            },
            ecmaVersion: 'latest',
            sourceType: 'module'
        },

        rules: {
            'no-console': 'warn',
            'no-debugger': 'warn',
            'max-depth': ['error', 3],
            '@typescript-eslint/no-floating-promises': 'error',
            'vue/script-indent': 'off',
            'vue/multi-word-component-names': 'off',
            'vue/require-default-prop': 'off',
            'vue/no-v-html': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            // '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
            'no-nested-ternary': 'off',
            'unicorn/no-nested-ternary': 'off',
            'unicorn/prefer-top-level-await': 'off',

            '@typescript-eslint/restrict-plus-operands': [
                'error',
                {
                    allowNumberAndString: true
                }
            ],

            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'default',
                    format: ['camelCase', 'PascalCase'],
                    leadingUnderscore: 'allow',
                    trailingUnderscore: 'allow'
                },
                {
                    selector: 'variable',
                    format: ['camelCase', 'UPPER_CASE'],
                    leadingUnderscore: 'allow',
                    trailingUnderscore: 'allow'
                },
                {
                    selector: ['class', 'typeLike', 'typeParameter', 'enum'],
                    format: ['PascalCase']
                },
                {
                    selector: ['function'],
                    format: ['camelCase'],
                    leadingUnderscore: 'allow'
                },
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                    custom: {
                        regex: '^I[A-Z]',
                        match: true
                    }
                },
                {
                    selector: 'enum',
                    format: ['PascalCase'],
                    custom: {
                        regex: '^E[A-Z]',
                        match: true
                    }
                },
                {
                    selector: ['memberLike', 'enumMember'],
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'],
                    leadingUnderscore: 'allow',
                    trailingUnderscore: 'allow'
                }
            ],

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/consistent-destructuring.md
            'unicorn/better-regex': 'warn',

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/better-regex.md
            'unicorn/consistent-destructuring': 'warn',

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/filename-case.md
            // Every file is camelCase except Vue components and tests (see below)
            'unicorn/filename-case': [
                'error',
                {
                    case: 'camelCase'
                }
            ],

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/catch-error-name.md
            'unicorn/catch-error-name': [
                'error',
                {
                    name: 'error'
                }
            ],

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prevent-abbreviations.md
            'unicorn/prevent-abbreviations': [
                'error',
                {
                    replacements: {
                        i: false,
                        e: false,
                        len: false,
                        prop: false,
                        props: false,
                        prev: false,
                        opts: {
                            options: true
                        },
                        ref: {
                            reference: false
                        }
                    }
                }
            ]

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/string-content.md
            // 'unicorn/string-content': [
            //   'error',
            //   {
            //     patterns: {
            //       unicorn: '🦄',
            //       awesome: {
            //         suggest: '😎',
            //         message: 'Please use `😎` instead of `awesome`.',
            //       },
            //       cool: {
            //         suggest: '😎',
            //         fix: false,
            //       },
            //     },
            //   },
            // ],
        }
    },

    /**
     * JSDoc, the part CLAUDE.md makes checkable.
     * Presence:   an exported function, interface, type or enum has a JSDoc block.
     * Accuracy:   a `@param` names a real parameter, tags are real tags, descriptions say something.
     *
     * `require-param` and `require-returns` stay OFF: CLAUDE.md asks for those tags "as needed",
     * and a rule cannot read that word. `disableMissingParamChecks` is that same "as needed"
     * written as an option, and `checkDestructured: false` keeps an options bag documented on its
     * interface rather than at every call site.
     *
     * https://github.com/gajus/eslint-plugin-jsdoc
     */
    {
        files: ['src/**/*.ts'],

        plugins: { jsdoc: pluginJsdoc },

        // TypeScript mode: types live in the signature, so the tags are not asked to repeat them.
        settings: { jsdoc: { mode: 'typescript' } },

        rules: {
            'jsdoc/require-jsdoc': [
                'error',
                {
                    publicOnly: true,
                    require: {
                        FunctionDeclaration: true,
                        ArrowFunctionExpression: true,
                        FunctionExpression: true,
                        ClassDeclaration: true
                    },
                    contexts: [
                        'TSInterfaceDeclaration',
                        'TSTypeAliasDeclaration',
                        'TSEnumDeclaration'
                    ]
                }
            ],
            'jsdoc/check-param-names': [
                'error',
                { checkDestructured: false, disableMissingParamChecks: true }
            ],
            'jsdoc/check-tag-names': 'error',
            'jsdoc/require-param-description': 'error',
            'jsdoc/require-returns-description': 'error',
            'jsdoc/require-throws': 'error'
        }
    },

    /**
     * Specific naming conventions for components (PascalCase)
     * WARNING: Slows down a lot
     */
    {
        files: ['**/*.vue', '**/*.tsx'],
        rules: {
            'unicorn/filename-case': [
                'error',
                {
                    case: 'pascalCase'
                }
            ]
        }
    },

    /**
     * "Special" files names are better to be left untouched
     */
    {
        files: ['tests/**/*', '**/*.spec.ts', '**/*.test.ts', '**/*.d.ts'],
        rules: {
            'unicorn/filename-case': 'off',
            'unicorn/prevent-abbreviations': 'off'
        }
    },
    {
        files: ['**/*.d.ts'],
        rules: {
            '@typescript-eslint/naming-convention': 'off'
        }
    },

    /**
     * Jest test files: a dedicated tsconfig (type-aware linting needs one, and the test files
     * aren't part of `tsconfig.json`'s own `src/` build).
     */
    {
        files: ['src/**/__tests__/*', 'tests/**/*', '**/*.{spec,test}.{ts,tsx}'],
        languageOptions: {
            parserOptions: {
                projectService: false,
                project: ['./tsconfig.vitest.json']
            }
        }
    }
);
