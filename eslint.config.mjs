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

  // ── 8. Modulith boundaries ─────────────────────────────────────────────────
  //   Turns the editor's folder layout into an enforced module graph. MODULE_GRAPH
  //   below is the whole spec: for each top-level src/* folder, the *only* other
  //   folders it's allowed to import from — exactly the edges that exist in the
  //   real codebase today (derived by grepping cross-folder imports; see the
  //   "carve out mothscilla" / "true modulith" conversation this came from).
  //   Anything not listed — in particular a new cycle — fails the build instead
  //   of just looking wrong in review.
  //
  //   (eslint-plugin-boundaries was tried first and dropped: several real bugs/
  //   quirks in its v7 element-matching surfaced even after working around each
  //   one — including one where every element silently matched nothing, so the
  //   rule looked configured but enforced zero policies. Better a plainer
  //   mechanism whose semantics are fully trusted than a fancier one that might
  //   silently be a no-op. no-restricted-imports has no such ambiguity.)
  //
  //   `npm run lint` must be wired into CI for this to mean anything — see
  //   .github/workflows/ci.yml.
  //
  //   Every module with a real public API (src/<module>/index.ts) also gets
  //   entry-point enforcement: any consumer allowed to depend on it at all
  //   must import through that barrel, never reach a sibling file directly —
  //   BARREL_EXCEPTIONS lists, per module, the files allowed to stay
  //   deep-importable anyway (almost always because they're intentionally
  //   dynamic-`import()`ed at their call site to stay in their own lazy
  //   chunk — routing them through the barrel would merge those chunks back
  //   together and undo the split). plugin-ui and audioWorklets have no
  //   entry here because nothing imports from them to begin with.
  //
  //   Everything lives in ONE generator so every file gets exactly one
  //   `no-restricted-imports` config: two separate blocks both setting that
  //   rule for overlapping files don't merge in flat config — the later block
  //   just replaces the earlier one's value outright, silently dropping it.
  ...(() => {
    const MODULE_GRAPH = {
      entry: ['ui'],
      app: ['components', 'constants', 'docs', 'host', 'nodes', 'sys', 'util', 'utils'],
      ui: ['components', 'host', 'sys'],
      'plugin-ui': ['sys', 'ui'],
      nodes: ['components', 'host', 'sys', 'types', 'util', 'utils', 'virtualNodes'],
      constants: ['nodes'],
      docs: ['nodes'],
      components: ['host', 'util'],
      utils: ['components'],
      host: ['util'],
      sys: [],
      virtualNodes: [],
      util: [],
      types: [],
      audioWorklets: [],
    };
    // Only folders (not the two single-file roots, app/Flow.tsx and
    // entry/index.tsx) are meaningful import *targets* to restrict — nothing
    // but their one intended consumer has a reason to reach into a root file.
    const ALL_TARGETS = Object.keys(MODULE_GRAPH).filter((t) => t !== 'app' && t !== 'entry');
    const FOLDER = {
      ui: 'src/ui', 'plugin-ui': 'src/plugin-ui', nodes: 'src/nodes', constants: 'src/constants',
      docs: 'src/docs', components: 'src/components', utils: 'src/utils', host: 'src/host',
      sys: 'src/sys', virtualNodes: 'src/virtualNodes', util: 'src/util', types: 'src/types',
      audioWorklets: 'src/audioWorklets',
    };
    // Modules with a real barrel (src/<module>/index.ts) — every other module
    // allowed to depend on one of these must import through it. Listed files
    // (besides 'index' itself) are deep-import exceptions for that module.
    const BARREL_EXCEPTIONS = {
      host: ['compileWorklet', 'workletWasmShim', 'compileFlowWorklets', 'exportPortableFlow'],
      util: ['pitchDetection'],
      types: [],
      virtualNodes: [],
      sys: [],
      utils: [],
      components: [],
      constants: [],
      docs: [],
      ui: [],
      nodes: [],
    };
    const sourceBlocks = [
      { ownType: 'entry', filesGlob: 'index.tsx', allowed: MODULE_GRAPH.entry },
      { ownType: 'app', filesGlob: 'src/Flow.tsx', allowed: MODULE_GRAPH.app },
      ...Object.entries(FOLDER).map(([type, dir]) => ({
        ownType: type,
        filesGlob: `${dir}/*.{ts,tsx}`,
        allowed: MODULE_GRAPH[type],
      })),
    ];
    return sourceBlocks.map(({ ownType, filesGlob, allowed }) => {
      // Compare by type, not by path prefix — 'src/util' is a literal prefix
      // of 'src/utils', so a startsWith-based self-exclusion would wrongly
      // treat 'util' as "self" while generating the 'utils' block and let it
      // silently bypass the very rule meant to forbid utils -> util.
      const forbidden = ALL_TARGETS.filter((t) => t !== ownType && !allowed.includes(t));
      const patterns = forbidden.length
        ? [{
            group: forbidden.map((t) => `**/${FOLDER[t].replace('src/', '')}/*`),
            message: `This module isn't allowed to depend on that one — see MODULE_GRAPH in eslint.config.mjs (section 8).`,
          }]
        : [];
      for (const target of allowed) {
        if (target === ownType || !(target in BARREL_EXCEPTIONS)) continue;
        const targetDir = FOLDER[target].replace('src/', '');
        const exceptions = BARREL_EXCEPTIONS[target];
        patterns.push({
          group: [`**/${targetDir}/*`, `!**/${targetDir}/index`, ...exceptions.map((f) => `!**/${targetDir}/${f}`)],
          message: `Import from the ${target} barrel ('../${target}') instead of reaching into a sibling file directly — see src/${target}/index.ts.`,
        });
      }
      if (patterns.length === 0) return null;
      return {
        files: [filesGlob],
        rules: {
          'no-restricted-imports': ['error', { patterns }],
        },
      };
    }).filter(Boolean);
  })(),
);
