# Handoff — Phase 0: Foundation and decisions

**Date:** 2026-08-18
**Gate:** repo builds, lints, tests green on an (effectively) empty suite; thirteen ADRs written, each arguing a trade-off. **Status: green.**

## What was built

- **Root docs:** `BRIEF.md` (the brief, verbatim with section numbering normalised — §10 is art direction, §11 open questions, §12 success), `CLAUDE.md` (agent rules), `KICKOFF.md` (now pointing at Phase 1), `README.md`.
- **Monorepo:** pnpm workspaces (`packages/*`, `apps/*`, `tools/*`), Node 22, TypeScript 5.9 strict with the full paranoid set (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, …), ESLint 9 flat config with `typescript-eslint` strict-type-checked + Vue plugin, Vitest 3 with a root `projects` runner, Vite 6 + Vue 3.5 + Pinia 3 for `apps/manager`.
- **Packages** (identity + smoke test only, no phase-1 code): `@bullyoff/shared`, `rules`, `engine`, `worldgen`, `render`. Internal packages export TS source directly (`exports → ./src/index.ts`); `build` emits `dist/` via `tsc` for completeness. `engine/src/index.ts` already pins `TICK_HZ = 20`, `DT = 0.05` with a test.
- **Apps:** `manager` (Vue shell with design tokens, one Pinia store, one test; Vite `worker.format: 'es'` ready for the engine worker), `simcli` (Node CLI placeholder, runs with `node --experimental-strip-types`), `arcade` (deliberately empty stub — v1.x), `tools/calibrate` (placeholder).
- **Determinism guardrail (ADR-005, brought forward from Phase 1 because it is config, not code):** `eslint.config.js` bans `Math.{sin,cos,tan,…,pow,exp,log,random,hypot,cbrt}`, `Date.now`, `performance.now`, `crypto.*random*`, DOM/timer globals, and imports of pixi/vue/pinia/node builtins inside `packages/engine`, `rules`, `shared`. Verified to fire. `packages/shared/src/math/**` is the single exemption for `Math.*` (to build LUTs / act as test oracle).
- **CI:** `.github/workflows/ci.yml` — typecheck → lint → test → build on push/PR. A `determinism` job slot is reserved with a comment for Phase 1.
- **ADRs 001–013** in `docs/adr/`, indexed in `docs/adr/README.md`.

## What was decided (beyond the brief)

- **Internal packages consume TS source, not `dist/`.** Simplest possible dev loop for a solo monorepo; Vite/Vitest/tsc all handle it. `build` still emits `dist/` per package so publishing later is possible. Revisit only if typecheck times bite.
- **`packages/rules` and `packages/shared` are held to the same determinism lint as `engine`.** They run inside `tick()`; treating them more loosely would just move the leak.
- **`Math.hypot` and `Math.cbrt` are banned too** (not exact per spec). `Math.sqrt` is allowed and exact.
- **Vitest environment is `node` for every project.** No jsdom anywhere yet; `render`/`manager` will opt in per-project when a DOM is actually needed (Phase 5).
- **Arcade is a stub with a README, not a Vue app.** CLAUDE.md rule 2 (don't scaffold ahead) beats the tidy-looking layout.
- **ADR-007** picks IndexedDB + JSON + linear save migrations, append-only replay schema (replays are not migrated). **ADR-008** picks Pinia + one Web Worker + hand-written typed `postMessage` protocol (no Comlink, no SAB). **ADR-009** picks vue-i18n with build-time compiled messages, `en` as source, missing NL/FR keys fail CI. **ADR-010** makes property tests optional-selective (`fast-check`, decide in Phase 1) and coverage reported-not-gated.
- **Toolchain versions:** resolved to ESLint 9.39 / TS 5.9 / Vitest 3.2 / Vite 6.4 although newer majors exist (ESLint 10, TS 7, Vitest 4). Deliberately stayed on the versions the config was written for; a bump is a small, separate chore for Jan to decide, not a phase-0 risk.

## What surprised us

- pnpm 10 blocks esbuild's postinstall by default; `pnpm.onlyBuiltDependencies: ["esbuild"]` in root `package.json` fixes it (needed for Vite).
- typescript-eslint's `projectService` needs root config files (`eslint.config.js`, `vitest.config.ts`) covered by *some* tsconfig; a tiny root `tsconfig.json` with `allowJs` does it. `tseslint.config()` is deprecated in favour of `defineConfig` from `eslint/config`.
- typescript-eslint (plain tsc) cannot see into `.vue` files, so `apps/manager/src/shims-vue.d.ts` exists purely to keep the linter honest; `vue-tsc` ignores it.

## What Phase 1 should watch out for

1. **Design the `MatchEvent` schema first, before physics.** ADR-002/007: append-only, versioned header, must carry enough kinematics for 60 fps interpolation without state access (ADR-013). Measure the log size of a full match early (< 2 MB target).
2. **`Rng`:** PCG32 vs xorshift128+ — pick PCG32 unless there's a reason; must be serialisable and its stream tested against a reference implementation. Inject; never global.
3. **`Scalar` alias and `shared/math`** (LUT sin/cos with interpolation, own atan2, own pow for the exponents actually used). Add tests comparing against native `Math.*` within a documented tolerance — that test file lives in `shared/src/math/` where native `Math.*` is permitted.
4. **Swept collision is not optional** (ADR-004). Write the 130 km/h-from-14 m goal test and the post-rebound test *first*, red, then make them green.
5. **Determinism harness:** 100-run hash in Vitest, then Playwright across Chromium/Firefox/WebKit in CI. Reserve the `determinism` job in `ci.yml`. Decide whether Playwright browsers install in CI or run in a container — it's the slowest CI step you'll add.
6. **Worker protocol** (ADR-008): keep `packages/engine` ignorant of workers; the adapter is a thin file. Type every message; no `Map`/`Set` across the boundary.
7. **Surface state must be a parameter set** `{dry, watered, wet}` from the first friction line — not a later flag.
8. **No rules yet.** Phase 1 is a hockey-shaped physics sandbox. If a "just a small rule" seems necessary to make a test meaningful, stub it and note it for Phase 2.
9. Recruit the situational review panel (BRIEF open question 1) — it must exist before Phase 3.

## Files created / changed in this phase

See the file list in the phase-0 completion message; everything under `C:\dev\bullyoff` is new.
