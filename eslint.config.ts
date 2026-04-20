import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginUnicorn from 'eslint-plugin-unicorn';
import { globalIgnores } from 'eslint/config';
import pluginVitest from '@vitest/eslint-plugin';
import pluginCypress from 'eslint-plugin-cypress';
import pluginOxlint from 'eslint-plugin-oxlint';

export default tseslint.config(
    globalIgnores(['**/dist/**', '**/docs/**', '**/node_modules/**', '**/eslint.config.ts']),
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...pluginOxlint.configs['flat/recommended'],
    pluginUnicorn.configs['flat/recommended'],
    {
        files: ['**/*.{ts,mts,tsx,js,cjs,mjs}'],
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
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
            'no-nested-ternary': 'off',
            'unicorn/no-nested-ternary': 'off',
            'unicorn/prefer-top-level-await': 'off',
            '@typescript-eslint/restrict-plus-operands': 'off',
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
            'unicorn/better-regex': 'warn',
            'unicorn/consistent-destructuring': 'warn',
            'unicorn/filename-case': [
                'error',
                {
                    case: 'camelCase'
                }
            ],
            'unicorn/catch-error-name': [
                'error',
                {
                    name: 'error'
                }
            ],
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
        }
    },
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
    {
        ...pluginVitest.configs.recommended,
        files: ['src/**/__tests__/*', 'tests/**/*', '**/*.{spec,test}.{ts,tsx}'],
        languageOptions: {
            parserOptions: {
                projectService: false,
                project: ['./tsconfig.vitest.json']
            }
        }
    },
    {
        ...pluginCypress.configs.recommended,
        files: [
            'cypress/e2e/**/*.{cy,spec}.{js,ts,jsx,tsx}',
            'cypress/support/**/*.{js,ts,jsx,tsx}'
        ],
        languageOptions: {
            parserOptions: {
                projectService: false,
                project: ['./tsconfig.cypress.json']
            }
        }
    }
);
