// ESLint: zalecane reguły JS + TypeScript. Kod strony i serwera sprawdzany tak samo.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'public/', 'tests/fixtures/', 'tests/golden/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
    },
  },
);
