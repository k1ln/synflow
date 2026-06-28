// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

export default tseslint.config(
  // ── 1. Globally ignored paths (generated / vendored / non-source) ──────────
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'coverage/**',
      'src/wasm/**', // Rust sources + wasm/cargo build artifacts
      '**/*.min.js',
      'terraform/**',
      'flow-examples/**',
      'todo/**',
    ],
  },

  // ── 2. Base recommended rule sets ─────────────────────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── 3. Project-wide tuning (applies to every linted file) ──────────────────
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    plugins: {
      'unused-imports': unusedImports,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // ── Unused-code detection (the core ask) ──
      // unused-imports owns this; disable the overlapping core/TS rules.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error', // auto-fixable, safe to remove
      // Strong signal, but kept as a warning (not a build-gating error): the
      // bulk of unused locals are dead `const X = ...` declarations whose safe
      // removal needs per-case side-effect review (e.g. `const t = setTimeout`).
      // Tracked here for an incremental cleanup pass rather than a risky sweep.
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // ── Correctness (tight, must-fix) ──
      'no-undef': 'off', // TypeScript already resolves identifiers
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-throw-literal': 'error',
      'no-useless-rename': 'error',
      'no-useless-concat': 'error',
      'no-debugger': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      // Allow non-breaking spaces in JSX prose (intentional "1 s"/"200 ms" typography);
      // still flag irregular whitespace inside actual code.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipJSXText: true }],
      'no-fallthrough': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-self-compare': 'error',
      'no-unreachable-loop': 'error',
      'default-case-last': 'error',

      // ── Style / hygiene (advisory) ──
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-alert': 'warn',
      'no-else-return': 'warn',
      'no-lonely-if': 'warn',
      'no-unneeded-ternary': 'warn',
      'object-shorthand': 'warn',
      'prefer-arrow-callback': 'warn',
      'dot-notation': 'warn',

      // ── TypeScript-specific (noisy on intentional Web Audio casts → warn) ──
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/ban-ts-comment': [
        'warn',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': 'allow-with-description' },
      ],
    },
  },

  // ── 4. React (hooks correctness + Vite fast-refresh hygiene) ──────────────
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // ── 4b. Type-aware bug detection (curated) ────────────────────────────────
  //   Enables real-bug rules that need type info, but deliberately omits the
  //   no-unsafe-* / no-explicit-any family so the intentional Web Audio casts
  //   stay as warnings rather than exploding into thousands of errors.
  {
    files: ['src/**/*.{ts,tsx}', 'index.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      // checksVoidReturn off: don't flag async fns passed as void React handlers
      // (benign); keep the high-signal promise-in-conditional / spread checks.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'warn',
    },
  },

  // ── 4c. Disable type-aware rules where there is no type info (JS tooling) ──
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // ── 5. AudioWorklet global scope ──────────────────────────────────────────
  {
    files: ['src/audioWorklets/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
        currentFrame: 'readonly',
        currentTime: 'readonly',
      },
    },
  },

  // ── 6. Node tooling (build/dev scripts + config files) ────────────────────
  {
    files: ['scripts/**', '*.config.{js,ts,mjs}', 'vite.config.js', 'vitest.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // Build/deploy scripts embed PowerShell/ssh/plink command strings where
      // escaped quotes (\" etc.) are intentional shell-quoting markers; removing
      // them is cosmetic and risks breaking the generated shell commands.
      'no-useless-escape': 'off',
    },
  },

  // ── 7. Tests (allow expressive test code) ─────────────────────────────────
  {
    files: ['tests/**', '**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
);
