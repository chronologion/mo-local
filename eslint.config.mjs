import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  eslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        crypto: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },
    rules: {
      ...tseslint.configs['recommended'].rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-undef': 'off', // TypeScript handles this
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        'describe',
        'it',
        'test',
        'expect',
        'beforeAll',
        'afterAll',
        'beforeEach',
        'afterEach',
      ],
    },
  },
  {
    files: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.{ts,tsx}'],
    ignores: [
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
          message:
            'Avoid double type assertions (`as unknown as X`). Prefer proper typing; if unavoidable at a boundary, add an eslint-disable with justification.',
        },
      ],
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.cargo/**',
      '**/.rustup/**',
      '**/Library/**',
      'packages/key-service-wasm/pkg/**',
    ],
  },
];
