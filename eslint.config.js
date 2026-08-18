// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

/**
 * Math.* members whose results are implementation-defined in precision (ECMA-262 §21.3.2).
 * V8, JSC and SpiderMonkey may differ in the last ulp. Banned in the engine — see ADR-005.
 * Math.sqrt, Math.abs, Math.floor, Math.ceil, Math.round, Math.trunc, Math.sign, Math.min,
 * Math.max, Math.hypot(2-arg is sqrt-based but NOT specified exactly — banned too), Math.fround
 * are exact and allowed. `Math.random` is banned for the obvious determinism reason.
 */
const IMPLEMENTATION_DEFINED_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10',
  'pow', 'cbrt', 'hypot',
  'random',
];

const engineRestrictedProperties = [
  ...IMPLEMENTATION_DEFINED_MATH.map((p) => ({
    object: 'Math',
    property: p,
    message: `Math.${p} is banned in packages/engine (non-deterministic across JS engines or outright random). Use @bullyoff/shared/math. See ADR-005.`,
  })),
  { object: 'Date', property: 'now', message: 'Wall-clock time is banned in the engine. Time is tick × dt. See ADR-002.' },
  { object: 'performance', property: 'now', message: 'Wall-clock time is banned in the engine. See ADR-002.' },
  { object: 'crypto', property: 'getRandomValues', message: 'Use the injected Rng. See ADR-002.' },
  { object: 'crypto', property: 'randomUUID', message: 'Use the injected Rng. See ADR-002.' },
];

const engineRestrictedGlobals = [
  { name: 'window', message: 'The engine is headless. No DOM. See ADR-002.' },
  { name: 'document', message: 'The engine is headless. No DOM. See ADR-002.' },
  { name: 'navigator', message: 'The engine is headless. See ADR-002.' },
  { name: 'localStorage', message: 'The engine does no I/O. See ADR-002.' },
  { name: 'fetch', message: 'The engine does no I/O. See ADR-002.' },
  { name: 'setTimeout', message: 'The engine has no timers; it is driven by tick(). See ADR-002.' },
  { name: 'setInterval', message: 'The engine has no timers; it is driven by tick(). See ADR-002.' },
  { name: 'requestAnimationFrame', message: 'The engine has no timers; it is driven by tick(). See ADR-002.' },
  { name: 'queueMicrotask', message: 'The engine is synchronous. See ADR-002.' },
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.d.ts',
      'pnpm-lock.yaml',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Root-level config files are covered by ./tsconfig.json.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // ── Engine determinism guardrail (BRIEF §4.3/§4.4, ADR-002, ADR-005) ─────────
  // Applies to engine, rules and shared: everything that runs inside tick().
  {
    files: ['packages/engine/**/*.ts', 'packages/rules/**/*.ts', 'packages/shared/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.spec.ts', '**/*.bench.ts', 'packages/engine/browser/**', 'packages/engine/src/worker/worker.ts'],
    languageOptions: {
      globals: {}, // no browser, no node globals — headless means headless
    },
    rules: {
      'no-restricted-properties': ['error', ...engineRestrictedProperties],
      'no-restricted-globals': ['error', ...engineRestrictedGlobals],
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['pixi.js', 'vue', 'pinia', 'node:*', 'fs', 'path', 'os', 'child_process'], message: 'The engine, rules and shared packages have zero runtime dependencies. See CLAUDE.md rule 3.' },
        ],
      }],
    },
  },
  // shared/math is the one place allowed to touch Math transcendentals: it wraps them
  // behind LUT / own implementations, and its tests compare against them.
  {
    files: ['packages/shared/src/math/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error',
        ...engineRestrictedProperties.filter((r) => r.object !== 'Math' || r.property === 'random'),
      ],
    },
  },

  // ── Node-only surfaces ────────────────────────────────────────────────────────
  {
    files: ['apps/simcli/**/*.ts', 'tools/**/*.ts', '*.config.{js,ts}', 'vitest.workspace.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  // ── Browser surfaces (Vue apps, render, the engine's browser harness) ───────
  {
    files: ['apps/manager/**/*.{ts,vue}', 'apps/arcade/**/*.{ts,vue}', 'packages/render/**/*.ts', 'packages/engine/browser/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/block-lang': ['error', { script: { lang: 'ts' } }],
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/define-macros-order': ['error', { order: ['defineProps', 'defineEmits'] }],
    },
  },

  // ── Test files: relax a few rules that fight test ergonomics ─────────────────
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
);
