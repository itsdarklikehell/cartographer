// ESLint flat config for an ES-module browser app with no runtime
// dependencies. `pnpm run lint` runs the eslint version that the lockfile
// pins. The app lists no config packages, so this file imports none. `no-undef` stays off
// because `tsc --noEmit` (checkJs + strict) already resolves identifiers with
// full DOM lib knowledge; ESLint here covers the style/logic rules tsc does not.
export default [
  // Agent worktrees live under .claude/worktrees/ inside the checkout. Their
  // work in progress is not part of this tree, and linting it fails the
  // pre-commit hook of the main checkout.
  { ignores: ['.claude/**'] },
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'bench/**/*.js', 'docs/gallery/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-shadow': 'error',
      'no-duplicate-imports': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-template-curly-in-string': 'error',
      'no-self-compare': 'error',
      'no-unreachable-loop': 'error',
      'no-constructor-return': 'error',
      'no-promise-executor-return': 'error',
      // require-atomic-updates is omitted: it false-positives on plain
      // "reassign shared state after a confirm dialog" patterns (eslint#11899).
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'no-useless-concat': 'error',
      'no-throw-literal': 'error',
      'default-case-last': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
];
